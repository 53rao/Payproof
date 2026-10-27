import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stderr, stdout, exit } from "node:process";

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  stderr.write("Run `npm run owner:hash` in an interactive terminal so the password is not echoed.\n");
  exit(1);
}

stderr.write("Owner password (12+ characters, input hidden): ");
stdin.setRawMode(true);
stdin.setEncoding("utf8");
stdin.resume();

let password = "";
stdin.on("data", (chunk) => {
  for (const char of chunk) {
    if (char === "\u0003") {
      stderr.write("\nCancelled.\n");
      stdin.setRawMode(false);
      exit(130);
    }
    if (char === "\r" || char === "\n") {
      stdin.setRawMode(false);
      stdin.pause();
      if (password.length < 12) {
        stderr.write("\nUse at least 12 characters. No hash was created.\n");
        exit(1);
      }
      const salt = randomBytes(16).toString("base64url");
      const derived = scryptSync(password, Buffer.from(salt, "base64url"), 64).toString("hex");
      password = "";
      stdout.write(`\nscrypt_v1:${salt}:${derived}\n`, () => exit(0));
    }
    if (char === "\u007f" || char === "\b") password = password.slice(0, -1);
    else if (char >= " ") password += char;
  }
});
