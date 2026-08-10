import type { ProviderProfileInput } from "@/types";

export interface ProviderPreset {
  id: string;
  group: "international" | "domestic";
  name: string;
  subtitle: string;
  provider_id: string;
  base_url: string;
  protocol: ProviderProfileInput["protocol"];
  mode: ProviderProfileInput["mode"];
  reasoning_effort: ProviderProfileInput["reasoning_effort"];
  default_model: string;
  suggested_models: string[];
  logo_src: string;
  logo_text: string;
  logo_class: string;
}

export const providerPresets: ProviderPreset[] = [
  {
    id: "linkbus",
    group: "international",
    name: "LinkBus",
    subtitle: "推荐国际模型入口",
    provider_id: "linkbus",
    base_url: "https://www.linkbus.net/v1",
    protocol: "responses",
    mode: "pure_api",
    reasoning_effort: "medium",
    default_model: "gpt-5.6-terra",
    suggested_models: ["gpt-5.4-mini", "gpt-5.6-terra", "gpt-5.6-sol"],
    logo_src: "https://www.linkbus.net/favicon.ico",
    logo_text: "LB",
    logo_class: "from-amber-500 via-orange-500 to-rose-500",
  },
  {
    id: "openai",
    group: "international",
    name: "GPT / OpenAI",
    subtitle: "官方 GPT 接口",
    provider_id: "OpenAI",
    base_url: "https://api.openai.com/v1",
    protocol: "responses",
    mode: "mixed_api",
    reasoning_effort: "medium",
    default_model: "gpt-5",
    suggested_models: ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4o-mini"],
    logo_src: "https://openai.com/favicon.ico",
    logo_text: "GPT",
    logo_class: "from-emerald-500 via-teal-500 to-cyan-500",
  },
  {
    id: "claude-placeholder",
    group: "international",
    name: "Claude",
    subtitle: "Anthropic Claude 官方兼容接入",
    provider_id: "Claude",
    base_url: "https://api.anthropic.com/v1",
    protocol: "chat_completions",
    mode: "official",
    reasoning_effort: "medium",
    default_model: "claude-sonnet-5",
    suggested_models: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5", "claude-fable-5"],
    logo_src: "https://www.anthropic.com/favicon.ico",
    logo_text: "CL",
    logo_class: "from-stone-500 via-neutral-500 to-zinc-600",
  },
  {
    id: "siliconflow",
    group: "domestic",
    name: "硅基流动",
    subtitle: "国产模型聚合平台",
    provider_id: "siliconflow",
    base_url: "https://api.siliconflow.cn/v1",
    protocol: "chat_completions",
    mode: "aggregate",
    reasoning_effort: "high",
    default_model: "deepseek-ai/DeepSeek-V3",
    suggested_models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen3-32B"],
    logo_src: "https://www.siliconflow.cn/favicon.ico",
    logo_text: "SF",
    logo_class: "from-cyan-500 via-sky-500 to-blue-500",
  },
  {
    id: "qiniu",
    group: "domestic",
    name: "七牛云",
    subtitle: "国产模型聚合平台",
    provider_id: "qiniu",
    base_url: "https://api.qnaigc.com",
    protocol: "chat_completions",
    mode: "aggregate",
    reasoning_effort: "high",
    default_model: "deepseek-v3",
    suggested_models: ["deepseek-v3", "deepseek-r1", "qwen-max"],
    logo_src: "https://api.qnaigc.com/favicon.ico",
    logo_text: "QN",
    logo_class: "from-sky-500 via-cyan-500 to-blue-600",
  },
  {
    id: "aionly",
    group: "domestic",
    name: "AIOnly",
    subtitle: "国产模型聚合平台",
    provider_id: "aionly",
    base_url: "https://api.aiionly.com",
    protocol: "chat_completions",
    mode: "aggregate",
    reasoning_effort: "high",
    default_model: "deepseek-chat",
    suggested_models: ["deepseek-chat", "deepseek-reasoner", "qwen-plus"],
    logo_src: "https://api.aiionly.com/favicon.ico",
    logo_text: "AI",
    logo_class: "from-emerald-500 via-green-500 to-teal-500",
  },
];

export const providerPresetGroups: Array<{
  id: ProviderPreset["group"];
  title: string;
  description: string;
}> = [
  {
    id: "international",
    title: "国际模型",
    description: "保留 GPT / OpenAI，并加入 Claude 占位选项。",
  },
  {
    id: "domestic",
    title: "国产模型聚合平台",
    description: "当前仅保留硅基流动、七牛云和 AIOnly。",
  },
];

export function findProviderPreset(providerId: string): ProviderPreset | null {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (!normalized) return null;
  return providerPresets.find((preset) => preset.provider_id.toLowerCase() === normalized) || null;
}
