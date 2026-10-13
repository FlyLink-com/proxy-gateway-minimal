import { useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { FileUp, Link2 } from "lucide-react";
import { ModalFrame } from "../../shared/public/modal-frame";
import "./third-party-import-entry.styles.css";

type ImportMode = "file" | "https";
type CheckResult = { error: string } | { success: string };

// Match the current inline YAML/parser boundary; no file body is read here.
const MAX_FILE_BYTES = 64 * 1024;

function addressError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "请输入 HTTPS YAML 地址。";
  if (value.length > 8192 || /[\u0000-\u0020\u007f-\u009f\\]/u.test(value)) return "地址格式无效，请检查后重试。";
  let parsed: URL;
  try { parsed = new URL(value); } catch { return "地址格式无效，请检查后重试。"; }
  if (parsed.protocol !== "https:") return "仅支持 HTTPS 地址。";
  if (parsed.username || parsed.password || value.includes("#")) return "地址不能包含登录凭证或片段。";
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  // This local prototype accepts domain names only. It does not establish DNS
  // safety or upstream reachability; the future server fetcher owns those checks.
  if (!hostname.includes(".") || hostname.includes(":") || /^[\d.]+$/u.test(hostname)
    || ["localhost", "local", "internal", "lan", "home", "test", "invalid"].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    return "请输入公网 HTTPS 域名地址，不支持 IP 或内网域名。";
  }
  return null;
}

export function ThirdPartyImportEntry({ disabled = false }: { disabled?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const fileTab = useRef<HTMLButtonElement>(null);
  const httpsTab = useRef<HTMLButtonElement>(null);
  const error = result && "error" in result ? result.error : null;

  function chooseMode(next: ImportMode) {
    if (mode === next) return;
    setMode(next);
    setFile(null);
    setAddress("");
    setResult(null);
  }

  function close() {
    setOpen(false);
    setMode("file");
    setFile(null);
    setAddress("");
    setResult(null);
  }

  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: ImportMode;
    if (event.key === "Home") next = "file";
    else if (event.key === "End") next = "https";
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = mode === "file" ? "https" : "file";
    else return;
    event.preventDefault();
    chooseMode(next);
    (next === "file" ? fileTab : httpsTab).current?.focus();
  }

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "file") {
      if (!file) return setResult({ error: "请选择 YAML 文件。" });
      if (!/\.ya?ml$/iu.test(file.name)) return setResult({ error: "请选择 .yaml 或 .yml 文件。" });
      if (file.size === 0) return setResult({ error: "文件为空，请重新选择。" });
      if (file.size > MAX_FILE_BYTES) return setResult({ error: "文件不能超过 64 KiB。" });
      setResult({ success: "文件类型和大小检查通过。未读取正文，正式导入尚未接通，节点列表未改变。" });
    } else if (mode === "https") {
      const invalid = addressError(address);
      setResult(invalid ? { error: invalid } : { success: "地址格式检查通过。未发起网络请求，正式导入尚未接通，节点列表未改变。" });
    }
  }

  return (
    <div className="tp-import">
      <div className="tp-import-actions" aria-label="节点导入入口">
        <button type="button" aria-haspopup="dialog" disabled={disabled} onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}>
          <FileUp aria-hidden="true" size={15} />导入
        </button>
      </div>
      {open ? (
        <ModalFrame title="导入节点" titleId={`${id}-title`} closeLabel="关闭导入" onClose={close} panelClassName="tp-import-modal">
          <div className="tp-import-tabs" role="tablist" aria-label="导入方式">
            <button ref={fileTab} id={`${id}-file-tab`} type="button" role="tab" aria-selected={mode === "file"} aria-controls={`${id}-file-panel`}
              tabIndex={mode === "file" ? 0 : -1} onKeyDown={tabKeyDown} onClick={() => chooseMode("file")}><FileUp aria-hidden="true" size={15} />文件导入</button>
            <button ref={httpsTab} id={`${id}-https-tab`} type="button" role="tab" aria-selected={mode === "https"} aria-controls={`${id}-https-panel`}
              tabIndex={mode === "https" ? 0 : -1} onKeyDown={tabKeyDown} onClick={() => chooseMode("https")}><Link2 aria-hidden="true" size={15} />HTTPS YAML</button>
          </div>
          <div role="tabpanel" id={`${id}-${mode}-panel`} aria-labelledby={`${id}-${mode}-tab`}>
          <p id={`${id}-hint`} className="tp-import-hint">
            {mode === "file" ? ".yaml / .yml，最大 64 KiB；本地只检查文件类型和大小。" : "支持带查询参数的公网 HTTPS 域名地址；本地不请求链接，不验证 DNS 或内容。"}
          </p>
          <form onSubmit={check} noValidate>
            <div className="tp-import-fields">
              {mode === "file" ? (
                <label key="file" htmlFor={`${id}-file`}>选择 YAML 文件
                  <input id={`${id}-file`} type="file" accept=".yaml,.yml" aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
                    onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} />
                </label>
              ) : (
                <label key="https" htmlFor={`${id}-address`}>HTTPS YAML 地址
                  <input id={`${id}-address`} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={address}
                    placeholder="https://…" aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
                    onChange={(event) => { setAddress(event.target.value); setResult(null); }} />
                </label>
              )}
              <button type="submit">{mode === "file" ? "检查文件" : "检查地址"}</button>
            </div>
            {error ? <p id={`${id}-error`} className="tp-import-error" role="alert">{error}</p> : null}
            {result && "success" in result ? <p className="tp-import-result" role="status">{result.success}</p> : null}
          </form>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}
