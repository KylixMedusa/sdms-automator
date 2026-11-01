# Run the server, worker and client (npm run dev) in the background.
#   make up       start everything
#   make down     stop everything
#   make restart  stop + start (needed after server/worker edits; tsx watch doesn't reload them)
#   make status   what's running
#   make logs     follow the combined output

.PHONY: up down restart status logs

STATE := .dev
PID   := $(STATE)/services.pid
LOG   := $(STATE)/services.log

up:
	@mkdir -p $(STATE)
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "Already running. Use: make restart"; exit 0; fi; \
	if lsof -iTCP:3001 -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port 3001 or 5173 is busy. Run: make down"; exit 1; fi; \
	: > $(LOG); \
	nohup npm run dev >> $(LOG) 2>&1 & echo $$! > $(PID); \
	echo "Starting... (logs: make logs)"; \
	for i in $$(seq 60); do \
		if grep -q "Job processor started" $(LOG) && lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "Up: http://localhost:5173"; exit 0; fi; \
		if ! kill -0 $$(cat $(PID)) 2>/dev/null; then \
			echo "Failed to start:"; tail -20 $(LOG); rm -f $(PID); exit 1; fi; \
		sleep 1; \
	done; echo "Still starting after 60s. Check: make logs"

# SIGTERM first so the worker can finish its step and log out of SDMS; force-kill after 30s.
down:
	@pids="$$(pgrep -f 'tsx watch (server|worker)/index.ts|vite --port 5173|concurrently .*dev:server')"; \
	[ -f $(PID) ] && pids="$$pids $$(cat $(PID))"; \
	pids="$$(for p in $$pids; do lsof -a -p $$p -d cwd -Fn 2>/dev/null | grep -qx "n$(CURDIR)\(/client\)\{0,1\}" && echo $$p; done)"; \
	if [ -z "$$pids" ]; then echo "Nothing running."; rm -f $(PID); exit 0; fi; \
	echo "Stopping..."; kill -TERM $$pids 2>/dev/null; \
	for i in $$(seq 30); do alive=""; for p in $$pids; do kill -0 $$p 2>/dev/null && alive=1; done; [ -z "$$alive" ] && break; sleep 1; done; \
	for p in $$pids; do kill -0 $$p 2>/dev/null && kill -KILL $$p && echo "Force-stopped $$p"; done; \
	rm -f $(PID); echo "Stopped."

restart: down up

status:
	@lsof -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1 && echo "server  up (:3001)" || echo "server  down"
	@pgrep -f 'tsx watch worker/index.ts' >/dev/null && echo "worker  up" || echo "worker  down"
	@lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && echo "client  up (:5173)" || echo "client  down"

logs:
	@tail -n 50 -f $(LOG)
