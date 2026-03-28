#!/bin/bash
set -e

PROJECT_DIR="projects/solo-smb-copilot"

echo "=== Running NeuroForge Project Benchmark ==="
cd "$PROJECT_DIR"

# 1. Type Check
echo "Running type check..."
npx tsc --noEmit

# 2. Lint
echo "Running linter..."
npm run lint -- --quiet

# 3. Unit Tests
echo "Running all unit tests..."
# Use the test script from package.json but ensuring it uses tsx
npx tsx --test src/lib/__tests__/*.test.ts

echo "=== Benchmark Completed Successfully ==="
