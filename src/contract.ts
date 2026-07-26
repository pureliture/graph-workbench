export type GraphNodeRole = "master";

export interface GraphLayoutHint {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly pinned?: boolean;
}

export interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly kind: string;
  readonly label: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly roles?: readonly GraphNodeRole[];
  readonly layoutHint?: GraphLayoutHint;
}

export interface GraphLink {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relationKind: string;
  readonly ordinal?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GraphInput {
  readonly schemaVersion: 1;
  readonly layout: {
    readonly seed: string;
    readonly hints?: Readonly<Record<string, unknown>>;
  };
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface GraphInputIssue {
  readonly path: string;
  readonly message: string;
}

export class GraphInputValidationError extends TypeError {
  readonly issues: readonly GraphInputIssue[];

  constructor(issues: readonly GraphInputIssue[]) {
    super(`graph input is invalid: ${issues.map((issue) => `${issue.path} ${issue.message}`).join(", ")}`);
    this.name = "GraphInputValidationError";
    this.issues = issues;
  }
}

export const graphInputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/pureliture/graph-workbench/schema/graph-input-v1.json",
  title: "GraphInput",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "layout", "nodes", "links"],
  properties: {
    schemaVersion: { const: 1 },
    layout: {
      type: "object",
      additionalProperties: false,
      required: ["seed"],
      properties: {
        seed: { type: "string", minLength: 1 },
        hints: { type: "object", additionalProperties: true },
      },
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "kind", "label"],
        properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string", minLength: 1 },
          kind: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
          metadata: { type: "object", additionalProperties: true },
          roles: {
            type: "array",
            uniqueItems: true,
            items: { enum: ["master"] },
          },
          layoutHint: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
              pinned: { type: "boolean" },
            },
          },
        },
      },
    },
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "source", "target", "relationKind"],
        properties: {
          id: { type: "string", minLength: 1 },
          source: { type: "string", minLength: 1 },
          target: { type: "string", minLength: 1 },
          relationKind: { type: "string", minLength: 1 },
          ordinal: { type: "integer", minimum: 0 },
          metadata: { type: "object", additionalProperties: true },
        },
      },
    },
    extensions: { type: "object", additionalProperties: true },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateMetadata(value: unknown, path: string, issues: GraphInputIssue[]): void {
  if (value !== undefined && !isRecord(value)) {
    issues.push({ path, message: "must be an object" });
  }
}

function validateLayoutHint(value: unknown, path: string, issues: GraphInputIssue[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  for (const axis of ["x", "y", "z"] as const) {
    if (value[axis] !== undefined && !finiteNumber(value[axis])) {
      issues.push({ path: `${path}.${axis}`, message: "must be a finite number" });
    }
  }
  if (value.pinned !== undefined && typeof value.pinned !== "boolean") {
    issues.push({ path: `${path}.pinned`, message: "must be a boolean" });
  }
}

export function validateGraphInput(value: unknown): GraphInput {
  const issues: GraphInputIssue[] = [];
  if (!isRecord(value)) {
    throw new GraphInputValidationError([{ path: "$", message: "must be an object" }]);
  }

  if (value.schemaVersion !== 1) {
    issues.push({ path: "$.schemaVersion", message: "must equal 1" });
  }
  if (!isRecord(value.layout) || !nonEmptyString(value.layout.seed)) {
    issues.push({ path: "$.layout.seed", message: "must be a non-empty string" });
  } else if (value.layout.hints !== undefined && !isRecord(value.layout.hints)) {
    issues.push({ path: "$.layout.hints", message: "must be an object" });
  }
  validateMetadata(value.extensions, "$.extensions", issues);

  const nodeIds = new Set<string>();
  const masterNodeIds: string[] = [];
  if (!Array.isArray(value.nodes)) {
    issues.push({ path: "$.nodes", message: "must be an array" });
  } else {
    value.nodes.forEach((node, index) => {
      const path = `$.nodes[${index}]`;
      if (!isRecord(node)) {
        issues.push({ path, message: "must be an object" });
        return;
      }
      for (const property of ["id", "type", "kind", "label"] as const) {
        if (!nonEmptyString(node[property])) {
          issues.push({ path: `${path}.${property}`, message: "must be a non-empty string" });
        }
      }
      if (nonEmptyString(node.id)) {
        if (nodeIds.has(node.id)) {
          issues.push({ path: `${path}.id`, message: "must be unique" });
        }
        nodeIds.add(node.id);
      }
      validateMetadata(node.metadata, `${path}.metadata`, issues);
      validateLayoutHint(node.layoutHint, `${path}.layoutHint`, issues);
      if (node.roles !== undefined) {
        if (!Array.isArray(node.roles) || node.roles.some((role) => role !== "master")) {
          issues.push({ path: `${path}.roles`, message: "may only contain master" });
        } else if (new Set(node.roles).size !== node.roles.length) {
          issues.push({ path: `${path}.roles`, message: "must not contain duplicates" });
        } else if (node.roles.includes("master") && nonEmptyString(node.id)) {
          masterNodeIds.push(node.id);
        }
      }
    });
  }
  if (masterNodeIds.length > 1) {
    issues.push({ path: "$.nodes", message: "may designate at most one master node" });
  }

  const linkIds = new Set<string>();
  if (!Array.isArray(value.links)) {
    issues.push({ path: "$.links", message: "must be an array" });
  } else {
    value.links.forEach((link, index) => {
      const path = `$.links[${index}]`;
      if (!isRecord(link)) {
        issues.push({ path, message: "must be an object" });
        return;
      }
      for (const property of ["id", "source", "target", "relationKind"] as const) {
        if (!nonEmptyString(link[property])) {
          issues.push({ path: `${path}.${property}`, message: "must be a non-empty string" });
        }
      }
      if (nonEmptyString(link.id)) {
        if (linkIds.has(link.id)) {
          issues.push({ path: `${path}.id`, message: "must be unique" });
        }
        linkIds.add(link.id);
      }
      if (nonEmptyString(link.source) && !nodeIds.has(link.source)) {
        issues.push({ path: `${path}.source`, message: "must reference a node id" });
      }
      if (nonEmptyString(link.target) && !nodeIds.has(link.target)) {
        issues.push({ path: `${path}.target`, message: "must reference a node id" });
      }
      if (link.source === link.target && nonEmptyString(link.source)) {
        issues.push({ path, message: "must not be a self link" });
      }
      if (
        link.ordinal !== undefined
        && (typeof link.ordinal !== "number" || !Number.isInteger(link.ordinal) || link.ordinal < 0)
      ) {
        issues.push({ path: `${path}.ordinal`, message: "must be a non-negative integer" });
      }
      validateMetadata(link.metadata, `${path}.metadata`, issues);
    });
  }

  if (issues.length > 0) throw new GraphInputValidationError(issues);
  return value as unknown as GraphInput;
}
