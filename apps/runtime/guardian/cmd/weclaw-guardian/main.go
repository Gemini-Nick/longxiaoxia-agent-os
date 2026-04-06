package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	PollIntervalSeconds      int             `json:"poll_interval_seconds"`
	LogFile                  string          `json:"log_file"`
	FailoverStateFile        string          `json:"failover_state_file"`
	WeclawConfigPath         string          `json:"weclaw_config_path"`
	FailbackSuccessThreshold int             `json:"failback_success_threshold"`
	Services                 []ServiceConfig `json:"services"`
}

type ServiceConfig struct {
	Name               string `json:"name"`
	Label              string `json:"label"`
	Domain             string `json:"domain"`
	Target             string `json:"target"`
	ServiceType        string `json:"service_type"`
	UID                int    `json:"uid"`
	RestartBaseSeconds int    `json:"restart_base_seconds"`
	MaxBackoffSeconds  int    `json:"max_backoff_seconds"`
}

type LaunchStatus struct {
	Found       bool
	Running     bool
	PID         int
	LastExit    *int
	Target      string
	Raw         string
	LookupError string
}

type serviceRuntime struct {
	ConsecutiveFailures int
	NextRestart         time.Time
}

type jsonLogger struct {
	writer io.Writer
}

type FailoverState struct {
	ActiveAgent        string `json:"active_agent"`
	Reason             string `json:"reason"`
	ChangedAt          string `json:"changed_at"`
	ClaudeStatus       string `json:"claude_status"`
	ClaudeHealthy      bool   `json:"claude_healthy"`
	CodexAvailable     bool   `json:"codex_available"`
	ManualOverride     bool   `json:"manual_override"`
	StableSuccesses    int    `json:"stable_successes"`
	DesiredAgent       string `json:"desired_agent,omitempty"`
	DesiredAgentSource string `json:"desired_agent_source,omitempty"`
	LastReconciledAt   string `json:"last_reconciled_at,omitempty"`
	LastConfigSyncedAt string `json:"last_config_synced_at,omitempty"`
}

type ClaudeHealth struct {
	Healthy bool
	Status  string
	Reason  string
}

type WeclawHealth struct {
	Healthy bool
	Status  string
	Reason  string
}

var (
	pidRe      = regexp.MustCompile(`(?m)^\s*pid = (\d+)`)
	lastExitRe = regexp.MustCompile(`(?m)last exit (?:code|status) = (-?\d+)`)
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	switch os.Args[1] {
	case "monitor":
		os.Exit(runMonitor(os.Args[2:]))
	case "status":
		os.Exit(runStatus(os.Args[2:]))
	case "restart":
		os.Exit(runRestart(os.Args[2:]))
	case "claude-worker":
		os.Exit(runClaudeWorker(os.Args[2:]))
	case "active-agent":
		os.Exit(runActiveAgent(os.Args[2:]))
	case "failover":
		os.Exit(runFailover(os.Args[2:]))
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `weclaw-guardian

Usage:
  weclaw-guardian monitor --config <path> [--uid <uid>] [--interval <seconds>] [--log <file>]
  weclaw-guardian status --config <path> [--uid <uid>]
  weclaw-guardian restart --config <path> --service <name-or-label> [--uid <uid>]
  weclaw-guardian claude-worker [--interval <seconds>] [--max-fails <n>] [--health-cmd <cmd>] [--log <file>]
  weclaw-guardian active-agent --config <path> [--uid <uid>]
  weclaw-guardian failover status --config <path> [--uid <uid>]
  weclaw-guardian failover reconcile --config <path> [--uid <uid>]
  weclaw-guardian failover switch --config <path> [--uid <uid>] --agent <claude|codex>
`)
}

func runMonitor(args []string) int {
	fs := flag.NewFlagSet("monitor", flag.ContinueOnError)
	cfgPath := fs.String("config", "~/.weclaw/services.json", "guardian config path")
	uid := fs.Int("uid", os.Getuid(), "uid for gui/user services")
	intervalOverride := fs.Int("interval", 0, "override poll interval seconds")
	logOverride := fs.String("log", "", "override log file path")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}

	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		return 1
	}

	interval := cfg.PollIntervalSeconds
	if interval <= 0 {
		interval = 30
	}
	if *intervalOverride > 0 {
		interval = *intervalOverride
	}

	logFile := cfg.LogFile
	if *logOverride != "" {
		logFile = *logOverride
	}
	if strings.TrimSpace(logFile) == "" {
		logFile = "/tmp/longclaw-guardian/guardian-core.log"
	}

	logger, err := newJSONLogger(logFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init logger: %v\n", err)
		return 1
	}

	state := make(map[string]*serviceRuntime)
	for _, svc := range cfg.Services {
		state[svc.Name] = &serviceRuntime{}
	}

	logger.log("info", "guardian_started", map[string]any{
		"config":   expandHome(*cfgPath),
		"interval": interval,
		"uid":      *uid,
	})

	failState, _ := loadFailoverState(cfg.FailoverStateFile)
	if reconciled, changed, recErr := reconcileFailover(cfg, *uid, failState, false); recErr != nil {
		logger.log("error", "failover_reconcile_failed", map[string]any{"error": recErr.Error()})
	} else if changed {
		logger.log("info", "failover_reconciled", failoverFields(reconciled))
	}

	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for {
		now := time.Now()
		for _, svc := range cfg.Services {
			target := resolveTarget(svc, *uid)
			rt := state[svc.Name]
			status := queryLaunchd(target)
			scheduled := strings.EqualFold(svc.ServiceType, "scheduled")

			if status.Running {
				if rt.ConsecutiveFailures > 0 {
					logger.log("info", "service_recovered", map[string]any{
						"service":  svc.Name,
						"label":    svc.Label,
						"target":   target,
						"pid":      status.PID,
						"failures": rt.ConsecutiveFailures,
					})
				}
				rt.ConsecutiveFailures = 0
				rt.NextRestart = time.Time{}
				continue
			}

			if scheduled {
				continue
			}

			if !rt.NextRestart.IsZero() && now.Before(rt.NextRestart) {
				continue
			}

			err := kickstart(target)
			rt.ConsecutiveFailures++
			backoff := computeBackoff(svc, rt.ConsecutiveFailures)
			rt.NextRestart = now.Add(backoff)

			fields := map[string]any{
				"service":                svc.Name,
				"label":                  svc.Label,
				"target":                 target,
				"running":                status.Running,
				"found":                  status.Found,
				"lookup_error":           status.LookupError,
				"last_exit":              status.LastExit,
				"consecutive_failures":   rt.ConsecutiveFailures,
				"next_restart_after_sec": int(backoff.Seconds()),
			}
			if err != nil {
				fields["restart_error"] = err.Error()
				logger.log("error", "service_restart_failed", fields)
			} else {
				logger.log("warn", "service_restarted", fields)
			}
		}
		failState, changed, recErr := reconcileFailover(cfg, *uid, failState, false)
		if recErr != nil {
			logger.log("error", "failover_reconcile_failed", map[string]any{"error": recErr.Error()})
		} else if changed {
			logger.log("info", "failover_reconciled", failoverFields(failState))
		}
		<-ticker.C
	}
}

func runStatus(args []string) int {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	cfgPath := fs.String("config", "~/.weclaw/services.json", "guardian config path")
	uid := fs.Int("uid", os.Getuid(), "uid for gui/user services")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}

	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		return 1
	}

	fmt.Printf("NAME\tLABEL\tTARGET\tSTATE\tPID\tLAST_EXIT\tERROR\n")
	unhealthy := false
	for _, svc := range cfg.Services {
		target := resolveTarget(svc, *uid)
		status := queryLaunchd(target)
		scheduled := strings.EqualFold(svc.ServiceType, "scheduled")
		state := "stopped"
		if status.Running {
			state = "running"
		} else if !status.Found {
			state = "missing"
		}
		pid := "-"
		if status.PID > 0 {
			pid = strconv.Itoa(status.PID)
		}
		lastExit := "-"
		if status.LastExit != nil {
			lastExit = strconv.Itoa(*status.LastExit)
		}
		errStr := ""
		if status.LookupError != "" {
			errStr = status.LookupError
		}
		if svc.Name == "weclaw" {
			weclawHealth := detectWeclawHealth()
			if weclawHealth.Status != "" && weclawHealth.Status != "running" {
				errStr = weclawHealth.Status
			}
		}
		fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\t%s\n", svc.Name, svc.Label, target, state, pid, lastExit, errStr)
		if state == "missing" {
			unhealthy = true
		} else if state != "running" && !scheduled {
			unhealthy = true
		}
	}

	if unhealthy {
		return 1
	}
	return 0
}

func runRestart(args []string) int {
	fs := flag.NewFlagSet("restart", flag.ContinueOnError)
	cfgPath := fs.String("config", "~/.weclaw/services.json", "guardian config path")
	uid := fs.Int("uid", os.Getuid(), "uid for gui/user services")
	service := fs.String("service", "", "service name or label")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}
	if strings.TrimSpace(*service) == "" {
		fmt.Fprintln(os.Stderr, "--service is required")
		return 2
	}

	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		return 1
	}

	for _, svc := range cfg.Services {
		if svc.Name == *service || svc.Label == *service {
			target := resolveTarget(svc, *uid)
			if err := kickstart(target); err != nil {
				fmt.Fprintf(os.Stderr, "restart %s failed: %v\n", target, err)
				return 1
			}
			fmt.Printf("restarted %s (%s)\n", svc.Name, target)
			return 0
		}
	}

	fmt.Fprintf(os.Stderr, "service not found: %s\n", *service)
	return 1
}

func runClaudeWorker(args []string) int {
	fs := flag.NewFlagSet("claude-worker", flag.ContinueOnError)
	interval := fs.Int("interval", envInt("CLAUDE_CHECK_INTERVAL_SECONDS", 120), "health check interval seconds")
	maxFails := fs.Int("max-fails", envInt("CLAUDE_MAX_CONSECUTIVE_FAILS", 3), "max consecutive failures before exit")
	healthCmd := fs.String("health-cmd", envString("CLAUDE_HEALTH_CMD", "claude --version"), "health check command")
	logPath := fs.String("log", envString("CLAUDE_LOG_FILE", "/tmp/longclaw-guardian/claude-worker.log"), "log file path")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}

	if *interval <= 0 {
		*interval = 120
	}
	if *maxFails <= 0 {
		*maxFails = 3
	}

	if _, err := exec.LookPath("claude"); err != nil {
		appendLine(*logPath, fmt.Sprintf("[%s] claude binary not found in PATH", time.Now().Format("2006-01-02 15:04:05")))
		return 1
	}

	fails := 0
	lastHealthStatus := ""
	for {
		ts := time.Now().Format("2006-01-02 15:04:05")
		cmd := exec.Command("bash", "-lc", *healthCmd)
		out, err := cmd.CombinedOutput()
		if len(out) > 0 {
			appendBytes(*logPath, out)
		}

		health := detectClaudeHealth()
		if health.Status == "not_logged_in" {
			fails = 0
			if lastHealthStatus != health.Status {
				appendLine(*logPath, fmt.Sprintf("[%s] claude auth unavailable; entering idle mode (%s)", ts, health.Reason))
			}
			lastHealthStatus = health.Status
		} else if err == nil && health.Healthy {
			fails = 0
			if lastHealthStatus != health.Status {
				appendLine(*logPath, fmt.Sprintf("[%s] claude health ok (%s)", ts, health.Status))
			}
			lastHealthStatus = health.Status
		} else if err == nil {
			fails++
			appendLine(*logPath, fmt.Sprintf("[%s] claude health failed (fails=%d/%d): %s", ts, fails, *maxFails, health.Reason))
			lastHealthStatus = health.Status
			if fails >= *maxFails {
				appendLine(*logPath, fmt.Sprintf("[%s] claude worker exiting for launchd restart", ts))
				return 1
			}
		} else {
			fails++
			appendLine(*logPath, fmt.Sprintf("[%s] claude health failed (fails=%d/%d): %v", ts, fails, *maxFails, err))
			lastHealthStatus = "command_failed"
			if fails >= *maxFails {
				appendLine(*logPath, fmt.Sprintf("[%s] claude worker exiting for launchd restart", ts))
				return 1
			}
		}

		time.Sleep(time.Duration(*interval) * time.Second)
	}
}

func runActiveAgent(args []string) int {
	fs := flag.NewFlagSet("active-agent", flag.ContinueOnError)
	cfgPath := fs.String("config", "~/.weclaw/services.json", "guardian config path")
	uid := fs.Int("uid", os.Getuid(), "uid for gui/user services")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}

	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		return 1
	}
	state, _, err := reconcileFailover(cfg, *uid, FailoverState{}, false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "reconcile failover: %v\n", err)
		return 1
	}
	fmt.Println(state.ActiveAgent)
	return 0
}

func runFailover(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "failover requires subcommand: status|reconcile|switch")
		return 2
	}
	switch args[0] {
	case "status":
		return runFailoverStatus(args[1:])
	case "reconcile":
		return runFailoverReconcile(args[1:])
	case "switch":
		return runFailoverSwitch(args[1:])
	default:
		fmt.Fprintf(os.Stderr, "unknown failover subcommand: %s\n", args[0])
		return 2
	}
}

func runFailoverStatus(args []string) int {
	fs := flag.NewFlagSet("failover status", flag.ContinueOnError)
	cfgPath := fs.String("config", "~/.weclaw/services.json", "guardian config path")
	uid := fs.Int("uid", os.Getuid(), "uid for gui/user services")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}
	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		return 1
	}
	state, _, err := reconcileFailover(cfg, *uid, FailoverState{}, false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "reconcile failover: %v\n", err)
		return 1
	}
	blob, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal failover state: %v\n", err)
		return 1
	}
	fmt.Println(string(blob))
	return 0
}

func runFailoverReconcile(args []string) int {
	fs := flag.NewFlagSet("failover reconcile", flag.ContinueOnError)
	cfgPath := fs.String("config", "~/.weclaw/services.json", "guardian config path")
	uid := fs.Int("uid", os.Getuid(), "uid for gui/user services")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}
	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		return 1
	}
	state, _, err := reconcileFailover(cfg, *uid, FailoverState{}, false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "reconcile failover: %v\n", err)
		return 1
	}
	fmt.Printf("active_agent=%s reason=%s claude_status=%s codex_available=%t\n", state.ActiveAgent, state.Reason, state.ClaudeStatus, state.CodexAvailable)
	return 0
}

func runFailoverSwitch(args []string) int {
	fs := flag.NewFlagSet("failover switch", flag.ContinueOnError)
	cfgPath := fs.String("config", "~/.weclaw/services.json", "guardian config path")
	uid := fs.Int("uid", os.Getuid(), "uid for gui/user services")
	agentName := fs.String("agent", "", "target active agent")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "parse flags: %v\n", err)
		return 2
	}
	if *agentName != "claude" && *agentName != "codex" {
		fmt.Fprintln(os.Stderr, "--agent must be claude or codex")
		return 2
	}
	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		return 1
	}
	state, err := loadFailoverState(cfg.FailoverStateFile)
	if err != nil {
		state = FailoverState{}
	}
	state.ManualOverride = true
	state.DesiredAgent = *agentName
	state.DesiredAgentSource = "manual_switch"
	state.Reason = "manual_switch"
	state.ChangedAt = time.Now().Format(time.RFC3339)
	state.LastReconciledAt = state.ChangedAt
	next, _, err := reconcileFailover(cfg, *uid, state, true)
	if err != nil {
		fmt.Fprintf(os.Stderr, "switch failover: %v\n", err)
		return 1
	}
	fmt.Printf("active_agent=%s reason=%s manual_override=%t\n", next.ActiveAgent, next.Reason, next.ManualOverride)
	return 0
}

func loadConfig(path string) (Config, error) {
	var cfg Config
	expanded := expandHome(path)
	data, err := os.ReadFile(expanded)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	if len(cfg.Services) == 0 {
		return cfg, errors.New("services is empty")
	}
	if strings.TrimSpace(cfg.FailoverStateFile) == "" {
		cfg.FailoverStateFile = "~/.weclaw/runtime/active-agent.json"
	}
	if strings.TrimSpace(cfg.WeclawConfigPath) == "" {
		cfg.WeclawConfigPath = "~/.weclaw/config.json"
	}
	if cfg.FailbackSuccessThreshold <= 0 {
		cfg.FailbackSuccessThreshold = 3
	}
	for i := range cfg.Services {
		if cfg.Services[i].Name == "" {
			cfg.Services[i].Name = cfg.Services[i].Label
		}
		if cfg.Services[i].RestartBaseSeconds <= 0 {
			cfg.Services[i].RestartBaseSeconds = 30
		}
		if cfg.Services[i].MaxBackoffSeconds <= 0 {
			cfg.Services[i].MaxBackoffSeconds = 600
		}
		if cfg.Services[i].ServiceType == "" {
			cfg.Services[i].ServiceType = "service"
		}
	}
	return cfg, nil
}

func expandHome(path string) string {
	if path == "~" {
		h, _ := os.UserHomeDir()
		return h
	}
	if strings.HasPrefix(path, "~/") {
		h, _ := os.UserHomeDir()
		return filepath.Join(h, strings.TrimPrefix(path, "~/"))
	}
	return path
}

func resolveTarget(svc ServiceConfig, defaultUID int) string {
	if strings.TrimSpace(svc.Target) != "" {
		return svc.Target
	}
	uid := svc.UID
	if uid <= 0 {
		uid = defaultUID
	}
	domain := strings.ToLower(strings.TrimSpace(svc.Domain))
	switch domain {
	case "system":
		return "system/" + svc.Label
	case "user":
		return fmt.Sprintf("user/%d/%s", uid, svc.Label)
	case "gui", "":
		return fmt.Sprintf("gui/%d/%s", uid, svc.Label)
	default:
		return domain + "/" + svc.Label
	}
}

func queryLaunchd(target string) LaunchStatus {
	cmd := exec.Command("launchctl", "print", target)
	out, err := cmd.CombinedOutput()
	text := string(out)
	status := LaunchStatus{Target: target, Raw: text, Found: true}

	lower := strings.ToLower(text)
	if err != nil {
		if strings.Contains(lower, "could not find service") || strings.Contains(lower, "not found") {
			status.Found = false
		}
		status.LookupError = strings.TrimSpace(err.Error())
	}

	if strings.Contains(text, "state = running") {
		status.Running = true
	}
	if m := pidRe.FindStringSubmatch(text); len(m) == 2 {
		if pid, convErr := strconv.Atoi(m[1]); convErr == nil {
			status.PID = pid
		}
	}
	if m := lastExitRe.FindStringSubmatch(text); len(m) == 2 {
		if ec, convErr := strconv.Atoi(m[1]); convErr == nil {
			status.LastExit = &ec
		}
	}
	return status
}

func kickstart(target string) error {
	cmd := exec.Command("launchctl", "kickstart", "-k", target)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func computeBackoff(svc ServiceConfig, failures int) time.Duration {
	if failures < 1 {
		failures = 1
	}
	base := svc.RestartBaseSeconds
	if base <= 0 {
		base = 30
	}
	maxBackoff := svc.MaxBackoffSeconds
	if maxBackoff <= 0 {
		maxBackoff = 600
	}
	sec := base
	for i := 1; i < failures; i++ {
		sec *= 2
		if sec >= maxBackoff {
			sec = maxBackoff
			break
		}
	}
	if sec > maxBackoff {
		sec = maxBackoff
	}
	return time.Duration(sec) * time.Second
}

func newJSONLogger(path string) (*jsonLogger, error) {
	expanded := expandHome(path)
	if err := os.MkdirAll(filepath.Dir(expanded), 0o755); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(expanded, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	return &jsonLogger{writer: io.MultiWriter(os.Stdout, f)}, nil
}

func (l *jsonLogger) log(level, event string, fields map[string]any) {
	if fields == nil {
		fields = map[string]any{}
	}
	fields["ts"] = time.Now().Format(time.RFC3339)
	fields["level"] = level
	fields["event"] = event
	blob, err := json.Marshal(fields)
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal log event failed: %v\n", err)
		return
	}
	_, _ = l.writer.Write(append(blob, '\n'))
}

func envInt(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func envString(name, fallback string) string {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	return raw
}

func detectClaudeHealth() ClaudeHealth {
	if _, err := exec.LookPath("claude"); err != nil {
		return ClaudeHealth{Healthy: false, Status: "binary_missing", Reason: "claude binary not found in PATH"}
	}
	cmd := exec.Command("claude", "auth", "status")
	out, err := cmd.CombinedOutput()
	var status struct {
		LoggedIn   bool   `json:"loggedIn"`
		AuthMethod string `json:"authMethod"`
	}
	if parseErr := json.Unmarshal(out, &status); parseErr == nil {
		if !status.LoggedIn {
			return ClaudeHealth{Healthy: false, Status: "not_logged_in", Reason: "claude auth not logged in"}
		}
		return ClaudeHealth{Healthy: true, Status: "logged_in", Reason: status.AuthMethod}
	}
	if err != nil {
		return ClaudeHealth{Healthy: false, Status: "auth_status_failed", Reason: strings.TrimSpace(string(out))}
	}
	if parseErr := json.Unmarshal(out, &status); parseErr != nil {
		return ClaudeHealth{Healthy: false, Status: "auth_status_invalid", Reason: strings.TrimSpace(string(out))}
	}
	return ClaudeHealth{Healthy: true, Status: "logged_in", Reason: status.AuthMethod}
}

func detectWeclawHealth() WeclawHealth {
	binPath := expandHome("~/.weclaw/bin/weclaw")
	if _, err := os.Stat(binPath); err != nil {
		return WeclawHealth{Healthy: false, Status: "binary_missing", Reason: "weclaw binary not found"}
	}

	logPath := expandHome("~/.weclaw/weclaw.log")
	if listener, err := exec.Command("bash", "-lc", "lsof -nP -iTCP:18011 -sTCP:LISTEN 2>/dev/null | rg -q 'weclaw'").CombinedOutput(); err == nil {
		_ = listener
		if data, err := os.ReadFile(logPath); err == nil {
			text := string(data)
			if idx := strings.LastIndex(text, "WeChat session expired and cannot be auto-recovered"); idx >= 0 {
				return WeclawHealth{Healthy: false, Status: "session_expired", Reason: "wechat session expired"}
			}
		}
		return WeclawHealth{Healthy: true, Status: "running", Reason: "weclaw listener active on 127.0.0.1:18011"}
	}
	if data, err := os.ReadFile(logPath); err == nil {
		text := string(data)
		if idx := strings.LastIndex(text, "WeChat session expired and cannot be auto-recovered"); idx >= 0 {
			return WeclawHealth{Healthy: false, Status: "session_expired", Reason: "wechat session expired"}
		}
	}

	cmd := exec.Command(binPath, "status")
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err == nil && strings.Contains(text, "weclaw is running") {
		return WeclawHealth{Healthy: true, Status: "running", Reason: text}
	}
	if strings.Contains(text, "stale pid file") {
		return WeclawHealth{Healthy: false, Status: "not_running", Reason: text}
	}
	if text != "" {
		return WeclawHealth{Healthy: false, Status: "status_failed", Reason: text}
	}
	return WeclawHealth{Healthy: false, Status: "status_failed", Reason: "weclaw status unavailable"}
}

func failoverFields(state FailoverState) map[string]any {
	return map[string]any{
		"active_agent":     state.ActiveAgent,
		"reason":           state.Reason,
		"claude_status":    state.ClaudeStatus,
		"claude_healthy":   state.ClaudeHealthy,
		"codex_available":  state.CodexAvailable,
		"manual_override":  state.ManualOverride,
		"stable_successes": state.StableSuccesses,
	}
}

func loadFailoverState(path string) (FailoverState, error) {
	var state FailoverState
	data, err := os.ReadFile(expandHome(path))
	if err != nil {
		return state, err
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, err
	}
	return state, nil
}

func writeFailoverState(path string, state FailoverState) error {
	expanded := expandHome(path)
	if err := os.MkdirAll(filepath.Dir(expanded), 0o755); err != nil {
		return err
	}
	blob, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(expanded, append(blob, '\n'), 0o644)
}

func syncWeclawDefaultAgent(path, agentName string) error {
	expanded := expandHome(path)
	if strings.TrimSpace(expanded) == "" {
		return nil
	}
	var cfg map[string]any
	data, err := os.ReadFile(expanded)
	if err == nil {
		if unmarshalErr := json.Unmarshal(data, &cfg); unmarshalErr != nil {
			return unmarshalErr
		}
	}
	if cfg == nil {
		cfg = map[string]any{}
	}
	cfg["default_agent"] = agentName
	if err := os.MkdirAll(filepath.Dir(expanded), 0o755); err != nil {
		return err
	}
	blob, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(expanded, append(blob, '\n'), 0o600)
}

func findService(cfg Config, name string) (ServiceConfig, bool) {
	for _, svc := range cfg.Services {
		if svc.Name == name {
			return svc, true
		}
	}
	return ServiceConfig{}, false
}

func reconcileFailover(cfg Config, uid int, state FailoverState, preserveManual bool) (FailoverState, bool, error) {
	now := time.Now()
	prev := state
	claudeHealth := detectClaudeHealth()
	codexSvc, hasCodex := findService(cfg, "codex")
	codexAvailable := false
	if hasCodex {
		codexAvailable = queryLaunchd(resolveTarget(codexSvc, uid)).Running
	}

	if preserveManual && state.ManualOverride && (state.DesiredAgent == "claude" || state.DesiredAgent == "codex") {
		state.ActiveAgent = state.DesiredAgent
		state.Reason = state.DesiredAgentSource
	} else if state.ManualOverride && !preserveManual {
		if state.DesiredAgent == "claude" && !claudeHealth.Healthy {
			state.ManualOverride = false
			state.DesiredAgent = ""
			state.DesiredAgentSource = ""
		}
		if state.DesiredAgent == "codex" && !codexAvailable {
			state.ManualOverride = false
			state.DesiredAgent = ""
			state.DesiredAgentSource = ""
		}
	}

	if state.ManualOverride {
		if state.ActiveAgent == "" {
			state.ActiveAgent = state.DesiredAgent
		}
	} else if !claudeHealth.Healthy {
		if codexAvailable {
			state.ActiveAgent = "codex"
			state.Reason = "claude_unavailable"
		} else if state.ActiveAgent == "" {
			state.ActiveAgent = "claude"
			state.Reason = "claude_unavailable_no_codex"
		}
		state.StableSuccesses = 0
	} else {
		if state.ActiveAgent == "codex" {
			state.StableSuccesses++
			if state.StableSuccesses >= cfg.FailbackSuccessThreshold {
				state.ActiveAgent = "claude"
				state.Reason = "claude_recovered"
				state.StableSuccesses = 0
			} else if state.Reason == "" {
				state.Reason = "claude_recovery_window"
			}
		} else {
			state.ActiveAgent = "claude"
			state.Reason = "claude_healthy"
			state.StableSuccesses = 0
		}
	}

	if state.ActiveAgent == "" {
		if codexAvailable {
			state.ActiveAgent = "codex"
			state.Reason = "codex_only"
		} else {
			state.ActiveAgent = "claude"
			state.Reason = "default_claude"
		}
	}

	state.ClaudeHealthy = claudeHealth.Healthy
	state.ClaudeStatus = claudeHealth.Status
	state.CodexAvailable = codexAvailable
	state.LastReconciledAt = now.Format(time.RFC3339)
	if state.ActiveAgent != prev.ActiveAgent || state.Reason != prev.Reason || state.ManualOverride != prev.ManualOverride {
		state.ChangedAt = now.Format(time.RFC3339)
	} else if state.ChangedAt == "" {
		state.ChangedAt = now.Format(time.RFC3339)
	}
	if err := writeFailoverState(cfg.FailoverStateFile, state); err != nil {
		return state, false, err
	}
	if err := syncWeclawDefaultAgent(cfg.WeclawConfigPath, state.ActiveAgent); err != nil {
		return state, false, err
	}
	state.LastConfigSyncedAt = now.Format(time.RFC3339)
	if err := writeFailoverState(cfg.FailoverStateFile, state); err != nil {
		return state, false, err
	}
	changed := state.ActiveAgent != prev.ActiveAgent || state.Reason != prev.Reason || state.ManualOverride != prev.ManualOverride || state.ClaudeStatus != prev.ClaudeStatus || state.CodexAvailable != prev.CodexAvailable
	return state, changed, nil
}

func appendLine(path, line string) {
	appendBytes(path, []byte(line+"\n"))
}

func appendBytes(path string, data []byte) {
	expanded := expandHome(path)
	if err := os.MkdirAll(filepath.Dir(expanded), 0o755); err != nil {
		return
	}
	f, err := os.OpenFile(expanded, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(data)
}
