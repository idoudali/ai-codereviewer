import { runAction } from "./action";

runAction().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
