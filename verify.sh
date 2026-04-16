#!/bin/bash
cd /home/node/.openclaw/workspace/paperclips
npm install
echo "PORT=3000
LLM_PROVIDER=openclaw" > .env
node server.js &
SERVER_PID=$!
sleep 10
node test.js
TEST_EXIT=$?
kill $SERVER_PID
exit $TEST_EXIT
