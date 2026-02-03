#!/usr/bin/env bats

@test "Node.js (LTS) Platform Test" {
  run docker build -t alfred-node -f alfred/docker/node.Dockerfile alfred
  [ "$status" -eq 0 ]
  run docker run --rm alfred-node
  [ "$status" -eq 0 ]
}

@test "Bun Platform Test" {
  run docker build -t alfred-bun -f alfred/docker/bun.Dockerfile alfred
  [ "$status" -eq 0 ]
  run docker run --rm alfred-bun
  [ "$status" -eq 0 ]
}

@test "Deno Platform Test" {
  run docker build -t alfred-deno -f alfred/docker/deno.Dockerfile alfred
  [ "$status" -eq 0 ]
  run docker run --rm alfred-deno
  [ "$status" -eq 0 ]
}
