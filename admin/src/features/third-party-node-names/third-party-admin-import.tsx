import { useEffect, useId, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { ModalFrame } from "../../shared/public/modal-frame";
import "./third-party-import-entry.styles.css";

export type ThirdPartyImportInput = { name: string; yamlContent: string; tiers: string[] };
const TIERS = [{ id: "monthly_basic", label: "基础月卡" }, { id: "monthly_plus", label: "进阶月卡" }, { id: "yearly", label: "年卡" }];

export function ThirdPartyAdminImport({ disabled, onImport }: {
  disabled: boolean;
  onImport: (input: ThirdPartyImportInput) => Promise<boolean>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tiers, setTiers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function close() {
    if (busyRef.current) return;
    setOpen(false); setName(""); setFile(null); setTiers([]); setError("");
  }

  async function submit() {
    if (busyRef.current || disabled) return;
    // eslint-disable-next-line no-control-regex -- Reject control characters before submitting the source name.
    if (!name.trim() || name.trim().length > 128 || /[\u0000-\u001f\u007f]/u.test(name)) {
      setError("请填写 1–128 字符的来源名称。"); return;
    }
    if (!file || !/\.ya?ml$/iu.test(file.name) || file.size < 1 || file.size > 65536) {
      setError("请选择非空的 YAML 文件，最大 64 KiB。"); return;
    }
    if (!tiers.length) { setError("请选择至少一个适用套餐档位。"); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const yamlContent = await file.text();
      if (!mounted.current) return;
      if (!yamlContent || new TextEncoder().encode(yamlContent).byteLength > 65536) {
        setError("文件内容无效或超过 64 KiB。"); return;
      }
      const imported = await onImport({ name: name.trim(), yamlContent, tiers: [...tiers] });
      if (!mounted.current) return;
      if (imported) {
        busyRef.current = false;
        close();
      } else setError("导入未完成。关闭弹窗查看处理提示；结果不明时先刷新来源，勿重复导入。");
    } catch {
      if (mounted.current) setError("无法完成文件导入，请关闭后检查状态；不要自动重复提交。");
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  return <div className="tp-import">
    <div className="tp-import-actions"><button type="button" disabled={disabled} aria-haspopup="dialog" onClick={() => setOpen(true)}><FileUp size={15} aria-hidden="true" />导入</button></div>
    {open ? <ModalFrame title="导入第三方节点" titleId={`${id}-title`} onClose={close} closeDisabled={busy} closeLabel="关闭导入" panelClassName="tp-import-modal">
      <p className="tp-import-hint">文件导入后保持停用。仅导入你获准分发的配置；原始内容不会回显。</p>
      <p className="tp-import-hint">HTTPS YAML：暂未开放服务端抓取，请下载文件后导入。</p>
      <form className="tp-import-fields" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label>来源名称<input value={name} maxLength={128} disabled={busy} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label>
        <label>YAML 文件<input type="file" accept=".yaml,.yml" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} /></label>
        <fieldset disabled={busy}><legend>适用套餐</legend>{TIERS.map((tier) => <label key={tier.id} className="tp-admin-tier"><input type="checkbox" checked={tiers.includes(tier.id)} onChange={(event) => setTiers((current) => event.target.checked ? [...current, tier.id] : current.filter((value) => value !== tier.id))} />{tier.label}</label>)}</fieldset>
        {error ? <p role="alert" className="tp-import-error">{error}</p> : null}
        <button type="submit" disabled={busy || disabled}>{busy ? "正在导入…" : "导入并保持停用"}</button>
      </form>
    </ModalFrame> : null}
  </div>;
}
