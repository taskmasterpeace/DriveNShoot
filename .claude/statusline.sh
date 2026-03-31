#!/bin/bash
DIR=$(basename "$(pwd)")
BRANCH=$(git branch --show-current 2>/dev/null)
echo "$DIR | $BRANCH"
