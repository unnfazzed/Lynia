import renderer, { act } from "react-test-renderer";

/**
 * `renderer.create` that has committed by the time it returns.
 *
 * React 19's test renderer commits only inside `act()`. A bare `create()` returns a renderer whose
 * `.root` throws "Can't access .root on unmounted test renderer", and the component then renders
 * after the test has ended ("import after the Jest environment has been torn down"). React 18
 * rendered synchronously, which is what the call sites using this helper were written against.
 */
export function renderSync(element: Parameters<typeof renderer.create>[0]): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

/**
 * The type a test-renderer instance of `component` reports. React Native 0.81 exports some core
 * components as `memo(fn)` (Pressable was `memo(forwardRef(fn))` in 0.76). A memo of a plain function
 * renders as a simple-memo fiber whose type is the INNER function, so `findByType(Pressable)` matches
 * nothing; `findByType(renderedType(Pressable))` finds it again.
 */
export function renderedType<T>(component: T): T {
  const inner = (component as { type?: unknown } | null)?.type;
  return (typeof inner === "function" ? inner : component) as T;
}
