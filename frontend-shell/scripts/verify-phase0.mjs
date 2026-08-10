import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contractsPath = resolve(root, "src/lmentor/api/contracts.ts");
const gatewayPath = resolve(root, "src/lmentor/runtime/gateway.ts");
const bridgePath = resolve(root, "scripts/lmentor-codex-bridge.mjs");
const invokeHookPath = resolve(root, "src/hooks/use-invoke.ts");
const platformCorePath = resolve(root, "src/lmentor/platform/core.ts");

const criticalBridgeRoutes = [
  "send_message",
  "abort_chat",
  "list_sessions",
  "list_all_sessions",
  "get_session_messages",
  "get_session_activity_trace",
  "get_session_names",
  "rename_session",
  "delete_session_name",
  "load_project_settings_local",
  "save_project_settings_local",
  "load_overview",
  "load_overview_module",
  "list_providers",
  "load_provider_module",
  "save_provider_profile",
  "delete_provider_profile",
  "activate_provider_profile",
  "sync_provider_sessions",
  "load_session_manager",
  "delete_session_record",
  "export_session_markdown",
  "list_tools_and_plugins",
  "load_tools_plugins_module",
  "save_context_entry_record",
  "delete_context_entry_record",
  "toggle_context_entry_record",
  "list_enhancements",
  "load_enhancements_module",
  "save_enhancements_settings",
];

function extractRoutes(source) {
  return [...source.matchAll(/command(?:<[\s\S]*?>)?\(\s*"[^"]+"\s*,\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractCases(source) {
  return [...source.matchAll(/case\s+"([^"]+)":/g)].map((match) => match[1]);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

const contractsSource = readFileSync(contractsPath, "utf8");
const gatewaySource = readFileSync(gatewayPath, "utf8");
const bridgeSource = readFileSync(bridgePath, "utf8");
const invokeHookSource = readFileSync(invokeHookPath, "utf8");
const platformCoreSource = readFileSync(platformCorePath, "utf8");

const routes = uniqueSorted(extractRoutes(contractsSource));
const bridgeCases = uniqueSorted(extractCases(bridgeSource));
const gatewayCases = uniqueSorted(extractCases(gatewaySource));

const routeSet = new Set(routes);
const bridgeSet = new Set(bridgeCases);
const gatewaySet = new Set(gatewayCases);

const uncoveredRoutes = routes.filter((route) => !bridgeSet.has(route) && !gatewaySet.has(route));
const bridgeOnlyRoutes = routes.filter((route) => bridgeSet.has(route) && !gatewaySet.has(route));
const gatewayOnlyRoutes = routes.filter((route) => !bridgeSet.has(route) && gatewaySet.has(route));
const dualRoutes = routes.filter((route) => bridgeSet.has(route) && gatewaySet.has(route));
const missingCriticalBridgeRoutes = criticalBridgeRoutes.filter((route) => !bridgeSet.has(route));
const unexpectedBridgeCases = bridgeCases.filter((route) => !routeSet.has(route));
const unexpectedGatewayCases = gatewayCases.filter((route) => !routeSet.has(route));

if (!invokeHookSource.includes('from "@/lmentor/api"')) {
  throw new Error("阶段 0 验收失败：use-invoke.ts 没有通过 Lmentor API 层调用。");
}

if (
  !platformCoreSource.includes("return await invokeBridge<T>(command, args);")
  || !platformCoreSource.includes("if (typed.fallback)")
  || !platformCoreSource.includes("return invokeGateway<T>(command, args);")
) {
  throw new Error("阶段 0 验收失败：platform core 没有形成 bridge-first、gateway 回退的调用边界。");
}

if (uncoveredRoutes.length > 0) {
  throw new Error(`阶段 0 验收失败：以下接口既没有 bridge 承接，也没有 gateway 回退：${uncoveredRoutes.join(", ")}`);
}

if (missingCriticalBridgeRoutes.length > 0) {
  throw new Error(`阶段 0 验收失败：以下关键接口尚未接入 bridge：${missingCriticalBridgeRoutes.join(", ")}`);
}

if (unexpectedBridgeCases.length > 0) {
  throw new Error(`阶段 0 验收失败：bridge 中存在未在 contracts.ts 注册的命令：${unexpectedBridgeCases.join(", ")}`);
}

if (unexpectedGatewayCases.length > 0) {
  throw new Error(`阶段 0 验收失败：gateway 中存在未在 contracts.ts 注册的命令：${unexpectedGatewayCases.join(", ")}`);
}

console.log("阶段 0 验收通过。");
console.log(`契约路由总数：${routes.length}`);
console.log(`Bridge 承接数：${bridgeCases.filter((route) => routeSet.has(route)).length}`);
console.log(`Gateway 回退数：${gatewayCases.filter((route) => routeSet.has(route)).length}`);
console.log(`双端覆盖数：${dualRoutes.length}`);
console.log(`仅 Bridge 覆盖数：${bridgeOnlyRoutes.length}`);
console.log(`仅 Gateway 覆盖数：${gatewayOnlyRoutes.length}`);
console.log(`关键 Bridge 命令数：${criticalBridgeRoutes.length}`);
if (gatewayOnlyRoutes.length > 0) {
  console.log(`当前仍走 Gateway 回退的命令：${gatewayOnlyRoutes.join(", ")}`);
}
