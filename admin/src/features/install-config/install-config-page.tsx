import { useMemo, useState } from "react";

const REQUIRED_ENV_KEYS = [
  "NODE_ENV",
  "CONSOLE_PORT",
  "CONSOLE_TOKEN",
  "SS_PASSWORD",
  "SUBSCRIPTION_DB_PATH",
  "SUBSCRIPTION_CONTROL_DB_PATH",
  "HANDOFF_DIR",
  "PUBLIC_SUBSCRIPTION_BASE_URL",
  "ADMIN_ALLOWED_CIDRS",
  "TRUSTED_PROXY_CIDRS",
  "SUB_RATE_LIMIT_WINDOW_MS",
  "SUB_RATE_LIMIT_MAX",
  "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES"
];

const OPTIONAL_ENV_KEYS = [
  "PAYMENT_PROVIDER",
  "PAYMENT_MODE",
  "PAYMENT_PROVIDER_API_KEY",
  "PAYMENT_PROVIDER_API_SECRET",
  "PAYMENT_PROVIDER_WEBHOOK_SECRET",
  "PAYMENT_RETURN_URL",
  "PAYMENT_CANCEL_URL",
  "PAYMENT_PUBLIC_BASE_URL",
  "CHANNEL_LAB_B_TUIC_HOST",
  "CHANNEL_LAB_B_TUIC_UUID",
  "CHANNEL_LAB_B_TUIC_PASSWORD",
  "CHANNEL_LAB_B_TUIC_CERT"
];

const BROWSER_SECRET_KEYS = new Set([
  "CONSOLE_TOKEN",
  "SS_PASSWORD",
  "PAYMENT_PROVIDER_API_KEY",
  "PAYMENT_PROVIDER_API_SECRET",
  "PAYMENT_PROVIDER_WEBHOOK_SECRET",
  "CHANNEL_LAB_B_TUIC_UUID",
  "CHANNEL_LAB_B_TUIC_PASSWORD",
  "CHANNEL_LAB_B_TUIC_CERT"
]);

const SECRET_PLACEHOLDER = "__SET_ON_HOST__";

const initialEnvText = [
  "# Runtime environment closure.",
  "# Copy to .env on the target host and fill values there only.",
  "NODE_ENV=production",
  "CONSOLE_PORT=3456",
  `CONSOLE_TOKEN=${SECRET_PLACEHOLDER}`,
  `SS_PASSWORD=${SECRET_PLACEHOLDER}`,
  "SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite",
  "SUBSCRIPTION_CONTROL_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscription-control.sqlite",
  "HANDOFF_DIR=/opt/proxy-gateway-minimal/handoff",
  "PUBLIC_SUBSCRIPTION_BASE_URL=https://control.example.invalid",
  "ADMIN_ALLOWED_CIDRS=127.0.0.1/32,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
  "TRUSTED_PROXY_CIDRS=",
  "SUB_RATE_LIMIT_WINDOW_MS=60000",
  "SUB_RATE_LIMIT_MAX=30",
  "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES=1440",
  "",
  "# Optional payment integration placeholders.",
  "PAYMENT_PROVIDER=",
  "PAYMENT_MODE=",
  "PAYMENT_PROVIDER_API_KEY=",
  "PAYMENT_PROVIDER_API_SECRET=",
  "PAYMENT_PROVIDER_WEBHOOK_SECRET=",
  "PAYMENT_RETURN_URL=",
  "PAYMENT_CANCEL_URL=",
  "PAYMENT_PUBLIC_BASE_URL=",
  "",
  "# Optional channel/canary placeholders.",
  "CHANNEL_LAB_B_TUIC_HOST=",
  "CHANNEL_LAB_B_TUIC_UUID=",
  "CHANNEL_LAB_B_TUIC_PASSWORD=",
  "CHANNEL_LAB_B_TUIC_CERT="
].join("\n");

type EnvParseResult = {
  values: Map<string, string>;
  errors: string[];
};

export function InstallConfigPage() {
  const [envText, setEnvText] = useState(initialEnvText);
  const envResult = useMemo(() => parseEnvText(envText), [envText]);
  const envValid = envResult.errors.length === 0;
  const facts = envValid ? buildEnvFacts(envResult.values) : [];
  const commandPreview = envValid
    ? buildCommandPreview(envResult.values)
    : "Fix .env validation errors before running gccgw dry-run.";

  function formatEnv() {
    if (!envValid) {
      return;
    }
    setEnvText(formatEnvText(envResult.values));
  }

  function resetExample() {
    setEnvText(initialEnvText);
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Local deployment console</h2>
          <p className="muted">
            .env 是运行时配置收口面；网页只负责编辑安全模板、校验必填项和生成 gccgw dry-run 入口。
          </p>
        </div>
      </div>

      <section className="install-config-hero" aria-labelledby="deployment-console-heading">
        <div>
          <p className="eyebrow">gccgw runtime env</p>
          <h3 id="deployment-console-heading">把部署参数收进 .env</h3>
          <p>
            先在本地网页整理 .env skeleton，再把真实值放到目标服务器。浏览器编辑器只保留占位符，
            不接收真实 token、密码、私钥、订阅链接或客户数据。
          </p>
        </div>
        <div className="install-config-status-panel">
          <strong>{envValid ? "OK" : "ERR"}</strong>
          <span>{envValid ? ".env valid" : ".env blocked"}</span>
          <small>{envValid ? "ready for dry-run" : "fix validation first"}</small>
        </div>
      </section>

      <section className="json-deployment-grid" aria-label="Runtime env editor">
        <article className="gate-review-card json-editor-card">
          <div className="page-heading">
            <div>
              <h2>.env 运行时配置编辑器</h2>
              <p className="muted">项目运行值统一收进 .env；JSON 只保留非敏感结构和校验关系。</p>
            </div>
            <div className="install-config-card-actions">
              <button className="ghost-button" type="button" onClick={resetExample}>
                Reset example .env
              </button>
              <button className="primary-button" type="button" onClick={formatEnv} disabled={!envValid}>
                Format .env
              </button>
            </div>
          </div>
          <label className="json-editor-label">
            <span>Runtime .env</span>
            <textarea
              aria-label="Runtime .env"
              className="json-package-textarea"
              value={envText}
              onChange={(event) => setEnvText(event.target.value)}
              spellCheck={false}
            />
          </label>
        </article>

        <article className="gate-review-card">
          <div className="page-heading">
            <div>
              <h2>Validation</h2>
              <p className="muted">校验必填 key、URL、端口、数字项和浏览器 secret 占位符。</p>
            </div>
          </div>
          {envResult.errors.length ? (
            <div className="alert alert-error">
              <strong>.env validation failed</strong>
              <ul className="validation-list">
                {envResult.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          ) : (
            <div className="alert alert-success">
              <strong>.env valid</strong>
              <p>可以进入 install configure / package inspect / package import dry-run。真实 apply 仍必须走 A 档审批。</p>
            </div>
          )}

          <div>
            <h3 className="section-mini-heading">Deployment flow</h3>
            <ol className="deployment-step-list">
              <li>1. Copy .env.example to .env on the target host</li>
              <li>2. Fill runtime values on the target host only</li>
              <li>3. gccgw install configure --dry-run</li>
              <li>4. gccgw package inspect / import --dry-run</li>
              <li>5. A-tier approval before apply</li>
            </ol>
          </div>
          <div className="install-config-card-actions">
            <button className="primary-button" type="button" disabled>
              Apply to server
            </button>
          </div>
        </article>
      </section>

      <section className="install-preview-grid" aria-label="Runtime env previews">
        <article className="gate-review-card">
          <div className="page-heading">
            <div>
              <h2>Runtime env facts</h2>
              <p className="muted">从 .env 派生，只展示非敏感运行边界。</p>
            </div>
          </div>
          {facts.length ? (
            <dl className="install-config-facts">
              {facts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} />)}
            </dl>
          ) : (
            <div className="alert alert-warning">Fix .env validation errors before deriving runtime facts.</div>
          )}
        </article>

        <article className="gate-review-card">
          <div className="page-heading">
            <div>
              <h2>Required runtime keys</h2>
              <p className="muted">这些 key 是当前收口后的服务器运行时闭包。</p>
            </div>
          </div>
          <div className="node-list">
            {REQUIRED_ENV_KEYS.map((key) => (
              <div className="node-row" key={key}>
                <div>
                  <strong>{key}</strong>
                  <span>{BROWSER_SECRET_KEYS.has(key) ? "secret placeholder in browser" : "runtime env key"}</span>
                </div>
                <span className={envResult.values.has(key) ? "config-state config-state-ready" : "config-state config-state-blocked"}>
                  {envResult.values.has(key) ? "present" : "missing"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="gate-review-card install-preview-wide">
          <div className="page-heading">
            <div>
              <h2>gccgw dry-run commands</h2>
              <p className="muted">命令预览只展示自检和 dry-run；真实 apply 默认禁用。</p>
            </div>
          </div>
          <pre className="config-preview" aria-label="gccgw dry-run commands">{commandPreview}</pre>
        </article>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function parseEnvText(envText: string): EnvParseResult {
  const values = new Map<string, string>();
  const errors: string[] = [];

  for (const [index, rawLine] of envText.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) {
      errors.push(`Line ${index + 1} must be KEY=value`);
      continue;
    }
    const [, key, value] = match;
    if (values.has(key)) {
      errors.push(`${key} is duplicated`);
    }
    values.set(key, value.trim());
  }

  for (const key of REQUIRED_ENV_KEYS) {
    if (!values.has(key)) {
      errors.push(`${key} is required`);
    }
  }

  validateRuntimeValues(values, errors);
  validateBrowserSecretPlaceholders(values, errors);

  return { values, errors };
}

function validateRuntimeValues(values: Map<string, string>, errors: string[]) {
  const publicBaseUrl = values.get("PUBLIC_SUBSCRIPTION_BASE_URL") || "";
  if (publicBaseUrl && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(publicBaseUrl)) {
    errors.push("PUBLIC_SUBSCRIPTION_BASE_URL must be an https URL");
  }

  for (const key of ["CONSOLE_PORT", "SUB_RATE_LIMIT_WINDOW_MS", "SUB_RATE_LIMIT_MAX", "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES"]) {
    const value = values.get(key) || "";
    if (value && (!/^\d+$/.test(value) || Number(value) <= 0)) {
      errors.push(`${key} must be a positive integer`);
    }
  }
}

function validateBrowserSecretPlaceholders(values: Map<string, string>, errors: string[]) {
  for (const key of BROWSER_SECRET_KEYS) {
    const value = values.get(key);
    if (value === undefined || value === "") {
      continue;
    }
    if (key === "CONSOLE_TOKEN" || key === "SS_PASSWORD") {
      if (value !== SECRET_PLACEHOLDER) {
        errors.push(`${key} must remain ${SECRET_PLACEHOLDER} in the browser editor`);
      }
      continue;
    }
    if (value !== SECRET_PLACEHOLDER) {
      errors.push(`${key} must remain blank or ${SECRET_PLACEHOLDER} in the browser editor`);
    }
  }
}

function formatEnvText(values: Map<string, string>) {
  const lines = [
    "# Runtime environment closure.",
    "# Copy to .env on the target host and fill values there only.",
    ...REQUIRED_ENV_KEYS.map((key) => `${key}=${values.get(key) || ""}`),
    "",
    "# Optional payment and channel placeholders.",
    ...OPTIONAL_ENV_KEYS.map((key) => `${key}=${values.get(key) || ""}`)
  ];
  return `${lines.join("\n")}\n`;
}

function buildEnvFacts(values: Map<string, string>) {
  return [
    { label: "Public base URL", value: values.get("PUBLIC_SUBSCRIPTION_BASE_URL") || "" },
    { label: "Admin source", value: firstCsvValue(values.get("ADMIN_ALLOWED_CIDRS") || "") },
    { label: "Runtime DB", value: values.get("SUBSCRIPTION_DB_PATH") || "" },
    { label: "Control DB", value: values.get("SUBSCRIPTION_CONTROL_DB_PATH") || "" },
    { label: "Handoff dir", value: values.get("HANDOFF_DIR") || "" },
    { label: "Console port", value: values.get("CONSOLE_PORT") || "" }
  ];
}

function buildCommandPreview(values: Map<string, string>) {
  const publicBaseUrl = values.get("PUBLIC_SUBSCRIPTION_BASE_URL") || "https://control.example.invalid";
  const installDir = deriveInstallDir(values.get("SUBSCRIPTION_DB_PATH") || "");
  const managementSource = firstCsvValue(values.get("ADMIN_ALLOWED_CIDRS") || "127.0.0.1/32");
  return [
    "gccgw self check",
    "gccgw install preflight --json",
    `gccgw install configure --dry-run --domain ${publicBaseUrl} --install-dir ${installDir} --management-source ${managementSource} --json`,
    "gccgw package inspect deployments/production-template --json",
    "gccgw package import deployments/production-template --dry-run --json",
    "",
    "# A-tier apply is intentionally not generated by this page.",
    "# Fill target-host .env values and use the approved runbook before any mutation."
  ].join("\n");
}

function firstCsvValue(value: string) {
  return value.split(",").map((item) => item.trim()).find(Boolean) || "";
}

function deriveInstallDir(runtimeDbPath: string) {
  const marker = "/.proxy-gateway/subscriptions.sqlite";
  if (runtimeDbPath.endsWith(marker)) {
    return runtimeDbPath.slice(0, -marker.length);
  }
  return "/opt/proxy-gateway-minimal";
}
