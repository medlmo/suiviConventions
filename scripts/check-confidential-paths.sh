#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 {tracked|staged|history REV|--path PATH}" >&2
  exit 2
}

is_confidential_path() {
  local path="${1,,}"

  case "$path" in
    .env.example|*/.env.example)
      return 1
      ;;
    .agents/memory|.agents/memory/*|\
    .env|.env.*|*/.env|*/.env.*|\
    .ssh/*|*/.ssh/*|\
    *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|\
    data/conventions_seed.json|\
    attached_assets/*|screenshots/*|.conversation/*)
      return 0
      ;;
  esac

  return 1
}

check_one_path() {
  local path="$1"
  if is_confidential_path "$path"; then
    printf 'Chemin confidentiel détecté : %s\n' "$path" >&2
    return 1
  fi
}

check_nul_stream() {
  local failed=0 path
  while IFS= read -r -d '' path; do
    if ! check_one_path "$path"; then
      failed=1
    fi
  done
  return "$failed"
}

check_history() {
  local revision="$1" exclude="${2-}" line path failed=0
  local -A reported=()
  local -a rev_list_args=()
  if [[ -n "$exclude" && "$exclude" != 0000000000000000000000000000000000000000 ]]; then
    rev_list_args+=("^$exclude")
  fi
  while IFS= read -r line; do
    # rev-list emits object IDs without a path for commits and trees.
    [[ "$line" == *" "* ]] || continue
    path="${line#* }"
    # A tree object can be emitted with an empty path. Associative-array keys
    # must be nonempty; quote path keys to prevent Bash subscript parsing.
    [[ -n "$path" ]] || continue
    [[ -z "${reported["$path"]+x}" ]] || continue
    reported["$path"]=1
    if ! check_one_path "$path"; then
      failed=1
    fi
  done < <(git rev-list --objects "$revision" "${rev_list_args[@]}")
  return "$failed"
}

case "${1-}" in
  tracked)
    [[ $# -eq 1 ]] || usage
    check_nul_stream < <(git ls-files -z)
    ;;
  staged)
    [[ $# -eq 1 ]] || usage
    check_nul_stream < <(git diff --cached --name-only --diff-filter=ACMR -z)
    ;;
  history)
    [[ $# -ge 2 && $# -le 3 ]] || usage
    check_history "$2" "${3-}"
    ;;
  --path)
    [[ $# -eq 2 ]] || usage
    check_one_path "$2"
    ;;
  *)
    usage
    ;;
esac
