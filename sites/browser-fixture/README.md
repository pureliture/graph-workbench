# Graph Workbench Browser Fixture

`@pureliture/graph-workbench/browser`를 실제 browser/WebGL 환경에서 mount하는
selection-driven fixture입니다. component, profile, workflow relation과 ordered
occurrence identity를 보존하며 Matrix와 detail panel이 같은 selection state를
공유하는지 확인할 수 있습니다.

## Commands

- `npm run build`: 먼저 local `@pureliture/graph-workbench` dependency를 build한 뒤 vinext/Sites Worker artifact를 생성합니다.
- `npm run test:browser`: browser evidence suite를 실행합니다.
