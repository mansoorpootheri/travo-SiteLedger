export { cn } from "cn"

export function today() {
  return new Date().toISOString().slice(0, 10);
}
