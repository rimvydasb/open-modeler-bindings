import { getQuickJS } from "https://esm.sh/quickjs-emscripten@0.23.0";
const qjs = await getQuickJS();
const vm = qjs.newContext();
const handle = vm.undefined;
console.log("Handle:", handle);
console.log("Handle Proto:", Object.getPrototypeOf(handle));
console.log("Symbol.dispose:", Symbol.dispose);

(handle as any)[Symbol.dispose] = () => console.log("Disposed!");
console.log("Manual Symbol.dispose on instance:", (handle as any)[Symbol.dispose]);

vm.dispose();
