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
    readonly occurrences?: readonly GraphLinkOccurrence[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface GraphLinkOccurrence {
    readonly ordinal: number;
    readonly id?: string;
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
export declare class GraphInputValidationError extends TypeError {
    readonly issues: readonly GraphInputIssue[];
    constructor(issues: readonly GraphInputIssue[]);
}
export declare const graphInputJsonSchema: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://github.com/pureliture/graph-workbench/schema/graph-input-v1.json";
    readonly title: "GraphInput";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["schemaVersion", "layout", "nodes", "links"];
    readonly properties: {
        readonly schemaVersion: {
            readonly const: 1;
        };
        readonly layout: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["seed"];
            readonly properties: {
                readonly seed: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly hints: {
                    readonly type: "object";
                    readonly additionalProperties: true;
                };
            };
        };
        readonly nodes: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["id", "type", "kind", "label"];
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly type: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly kind: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly label: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly metadata: {
                        readonly type: "object";
                        readonly additionalProperties: true;
                    };
                    readonly roles: {
                        readonly type: "array";
                        readonly uniqueItems: true;
                        readonly items: {
                            readonly enum: readonly ["master"];
                        };
                    };
                    readonly layoutHint: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly x: {
                                readonly type: "number";
                            };
                            readonly y: {
                                readonly type: "number";
                            };
                            readonly z: {
                                readonly type: "number";
                            };
                            readonly pinned: {
                                readonly type: "boolean";
                            };
                        };
                    };
                };
            };
        };
        readonly links: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["id", "source", "target", "relationKind"];
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly source: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly target: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly relationKind: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly ordinal: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly occurrences: {
                        readonly type: "array";
                        readonly minItems: 1;
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly required: readonly ["ordinal"];
                            readonly properties: {
                                readonly ordinal: {
                                    readonly type: "integer";
                                    readonly minimum: 0;
                                };
                                readonly id: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly metadata: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                            };
                        };
                    };
                    readonly metadata: {
                        readonly type: "object";
                        readonly additionalProperties: true;
                    };
                };
            };
        };
        readonly extensions: {
            readonly type: "object";
            readonly additionalProperties: true;
        };
    };
};
export declare function validateGraphInput(value: unknown): GraphInput;
//# sourceMappingURL=contract.d.ts.map