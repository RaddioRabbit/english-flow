type RuntimeSkillHandler = (params: unknown) => Promise<unknown>;

const RUNTIME_SKILL_REGISTRY_KEY = "__englishFlowRuntimeSkillRegistry";
const RUNTIME_SKILL_MARKER = "__englishFlowRuntimeSkillHandler";

type RuntimeWithSkillRegistry = typeof globalThis & {
  skill?: (name: string, params: unknown) => Promise<unknown>;
  [RUNTIME_SKILL_REGISTRY_KEY]?: Map<string, RuntimeSkillHandler>;
  [RUNTIME_SKILL_MARKER]?: boolean;
};

function getRuntime() {
  return globalThis as RuntimeWithSkillRegistry;
}

function ensureRuntimeSkillRegistry() {
  const runtime = getRuntime();
  if (!runtime[RUNTIME_SKILL_REGISTRY_KEY]) {
    runtime[RUNTIME_SKILL_REGISTRY_KEY] = new Map<string, RuntimeSkillHandler>();
  }

  if (!runtime.skill || runtime[RUNTIME_SKILL_MARKER]) {
    runtime.skill = async (name, params) => {
      const handler = runtime[RUNTIME_SKILL_REGISTRY_KEY]?.get(name);
      if (!handler) {
        throw new Error(`Unsupported runtime skill: ${name}`);
      }

      return handler(params);
    };
    runtime[RUNTIME_SKILL_MARKER] = true;
  }

  return runtime[RUNTIME_SKILL_REGISTRY_KEY]!;
}

export function registerRuntimeSkill(name: string, handler: RuntimeSkillHandler) {
  const registry = ensureRuntimeSkillRegistry();
  registry.set(name, handler);
}
