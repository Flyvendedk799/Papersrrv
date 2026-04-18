#!/bin/bash
exec /opt/homebrew/bin/socat TCP-LISTEN:80,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:3100
