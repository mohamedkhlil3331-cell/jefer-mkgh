---
name: AI integration env vars need provisioning
description: Why an already-written route calling AI_INTEGRATIONS_OPENAI_* can 503 in a given environment, and how to fix it.
---

Server code can correctly read `process.env.AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY` and still get empty values, causing routes to return 503 "خدمة الذكاء الاصطناعي غير متاحة حالياً" (or equivalent). This happens even when other routes in the same codebase already use the exact same pattern — the presence of that pattern elsewhere does not mean the env vars are actually set in the current environment/session.

**Why:** These env vars are provisioned per-environment by calling `setupReplitAIIntegrations` (in the code_execution sandbox), not by writing the fetch code itself. A route can be fully implemented and merged, but if `setupReplitAIIntegrations` was never invoked in this particular environment, the vars are simply unset.

**How to apply:** Before concluding an AI-integration route is broken (bad prompt, bad model, network issue), check `env | grep AI_INTEGRATIONS` first. If unset, call `setupReplitAIIntegrations({ providerSlug: "openai", providerUrlEnvVarName: "AI_INTEGRATIONS_OPENAI_BASE_URL", providerApiKeyEnvVarName: "AI_INTEGRATIONS_OPENAI_API_KEY" })`, then restart the affected workflow and retest. Same applies to other providers (Gemini, Anthropic, OpenRouter) with their respective env var names.
