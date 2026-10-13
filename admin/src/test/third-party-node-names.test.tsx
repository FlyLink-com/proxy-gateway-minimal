import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderedNodeName,
  validateNodeName,
  type ThirdPartyNode,
} from '../features/third-party-node-names/node-name-model';
import { ThirdPartyNodeNamesPage } from '../features/third-party-node-names/third-party-node-names-page';

const originalSendBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon');

function fixture(): ThirdPartyNode[] {
  return [
    { id: 'synthetic-a', sourceName: '合成来源甲', originalName: '合成节点甲', defaultName: '[3P] HK 1 | 合成节点甲', customName: null, countryCode: 'HK', protocol: 'VLESS' },
    { id: 'synthetic-b', sourceName: '合成来源乙', originalName: '合成节点乙', defaultName: '[3P] JP 1 | 合成节点乙', customName: '已命名乙', countryCode: 'JP', protocol: 'Hy2' },
    { id: 'synthetic-c', sourceName: '合成来源甲', originalName: '合成节点丙', defaultName: '[3P] HK 2 | 合成节点丙', customName: null, countryCode: 'HK', protocol: 'SS' },
  ];
}

function frozenFixture(): readonly ThirdPartyNode[] {
  return Object.freeze(fixture().map((node) => Object.freeze(node)));
}

function editor() {
  return screen.getByRole('textbox', { name: '对外显示名称' }) as HTMLInputElement;
}

function edit(value: string) {
  fireEvent.change(editor(), { target: { value } });
}

function apply() {
  fireEvent.click(screen.getByRole('button', { name: '应用到本地预览' }));
}

function openEditor(originalName: string) {
  fireEvent.click(screen.getByRole('button', { name: `编辑 ${originalName}` }));
}

function nodeRow(originalName: string) {
  return screen.getByRole('row', { name: new RegExp(originalName) });
}

function alertText() {
  return screen.getAllByRole('alert').map((alert) => alert.textContent).join(' ');
}

function expectInvalid(nodes: readonly ThirdPartyNode[], nodeId: string, input: string) {
  const result = validateNodeName(nodes, nodeId, input);
  expect(typeof result.error).toBe('string');
  expect(result.error).toMatch(/[\u3400-\u9fff]/u);
  return result;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalSendBeacon) Object.defineProperty(navigator, 'sendBeacon', originalSendBeacon);
  else Reflect.deleteProperty(navigator, 'sendBeacon');
});

describe('third-party node display-name validation', () => {
  it('renders custom names or the immutable default and trims a valid edit', () => {
    const nodes = fixture();
    expect(renderedNodeName(nodes[0])).toBe(nodes[0].defaultName);
    expect(renderedNodeName(nodes[1])).toBe('已命名乙');
    expect(validateNodeName(nodes, nodes[0].id, '  新的展示名  ')).toEqual({ value: '新的展示名', error: null });
    expect(validateNodeName(nodes, nodes[1].id, '  ')).toEqual({ value: null, error: null });
    expect(validateNodeName(nodes, nodes[1].id, '')).toEqual({ value: null, error: null });
  });

  it('matches backend UTF-16 bounds, allowing 64 emoji and rejecting 65', () => {
    const nodes = fixture();
    const boundary = '🌏'.repeat(64);
    expect(validateNodeName(nodes, nodes[0].id, `  ${boundary}  `)).toEqual({ value: boundary, error: null });
    expectInvalid(nodes, nodes[0].id, '🌏'.repeat(65));
    expectInvalid(nodes, nodes[0].id, '名'.repeat(129));
  });

  it.each([
    [0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x206f],
  ])('rejects every forbidden code point in range %i to %i before trimming', (first, last) => {
    const nodes = fixture();
    for (let code = first; code <= last; code += 1) {
      const control = String.fromCodePoint(code);
      for (const input of [`${control}正常名称`, `正常${control}名称`, `正常名称${control}`]) {
        expectInvalid(nodes, nodes[0].id, input);
      }
    }
  });

  it.each(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL', 'AUTO', 'STABLE', 'WEAK-NETWORK', 'FALLBACK'])(
    'rejects the case-insensitive reserved name %s without echoing the input', (reserved) => {
      const nodes = fixture();
      const input = `  ${reserved.toLowerCase()}  `;
      const result = expectInvalid(nodes, nodes[0].id, input);
      expect(result.error?.toLowerCase()).not.toContain(reserved.toLowerCase());
    },
  );

  it('compares other nodes effective names case-insensitively and permits the selected node name', () => {
    const nodes = fixture();
    nodes[1].customName = 'Example Name';
    expectInvalid(nodes, nodes[0].id, '  example name  ');
    expectInvalid(nodes, nodes[0].id, nodes[2].defaultName.toLowerCase());
    expect(validateNodeName(nodes, nodes[1].id, 'Example Name')).toEqual({ value: 'Example Name', error: null });
    expect(validateNodeName(nodes, nodes[0].id, nodes[1].defaultName)).toEqual({ value: nodes[1].defaultName, error: null });
  });

  it('rejects restore-default collisions and unknown identifiers without mutating frozen nodes', () => {
    const nodes = fixture();
    nodes[0].customName = '独立展示名甲';
    nodes[1].customName = nodes[0].defaultName.toLowerCase();
    const frozen = Object.freeze(nodes.map((node) => Object.freeze(node)));
    const before = JSON.stringify(frozen);
    expectInvalid(frozen, nodes[0].id, '  ');
    expectInvalid(frozen, 'synthetic-missing', '安全名称');
    expect(validateNodeName(frozen, nodes[0].id, '新的合成名称')).toEqual({ value: '新的合成名称', error: null });
    expect(JSON.stringify(frozen)).toBe(before);
  });
});

describe('third-party node names local preview', () => {
  it('starts as a compact one-line table without a separate editor, client card, statistics or source annotations', () => {
    const nodes = fixture();
    const { container } = render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(screen.queryByLabelText('编辑节点名称')).toBeNull();
    expect(screen.queryByLabelText('客户端名称预览')).toBeNull();
    expect(container.querySelector('.tp-names-summary')).toBeNull();
    expect(container.querySelector('.tp-names-notice')).toBeNull();
    expect(screen.getAllByRole('columnheader').map((item) => item.textContent)).toEqual(['原始名称', '对外显示名称', '国家/地区', '协议', '操作']);
    for (const node of nodes) {
      const row = within(nodeRow(node.originalName));
      expect(row.getAllByRole('cell')).toHaveLength(5);
      expect(row.queryByText(node.sourceName)).toBeNull();
      expect(row.queryByText(node.countryCode)).toBeNull();
      expect(row.queryByText('默认名称')).toBeNull();
      expect(row.queryByText('自定义名称')).toBeNull();
    }
    openEditor(nodes[0].originalName);
    expect(within(nodeRow(nodes[0].originalName)).getByRole('textbox', { name: '对外显示名称' })).toBe(editor());
    expect(within(nodeRow(nodes[0].originalName)).getByRole('button', { name: '应用到本地预览' })).toBeTruthy();
    expect(screen.queryByLabelText('客户端名称预览')).toBeNull();
  });

  it('applies only a local display-name change while preserving original identity, other rows and input props', () => {
    const nodes = frozenFixture();
    const before = JSON.stringify(nodes);
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    expect(screen.getByRole('heading', { name: '第三方节点命名', level: 1 })).toBeTruthy();
    expect(screen.getByText(/本地预览 · 合成数据 · 未连接后台/)).toBeTruthy();
    openEditor(nodes[0].originalName);
    edit('  我的展示名甲  ');
    expect(nodes[0].customName).toBeNull();
    expect(within(nodeRow(nodes[1].originalName)).getByText('已命名乙')).toBeTruthy();
    apply();
    const row = within(nodeRow(nodes[0].originalName));
    expect(row.getByText('我的展示名甲')).toBeTruthy();
    expect(row.getByText(nodes[0].originalName)).toBeTruthy();
    expect(row.queryByText(nodes[0].sourceName)).toBeNull();
    expect(row.getByText('VLESS')).toBeTruthy();
    expect(within(nodeRow(nodes[1].originalName)).getByText('已命名乙')).toBeTruthy();
    expect(within(nodeRow(nodes[2].originalName)).getByText(nodes[2].defaultName)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('已更新本地预览，尚未保存到后台。');
    expect(JSON.stringify(nodes)).toBe(before);
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(screen.queryByRole('button', { name: '应用到本地预览' })).toBeNull();
  });

  it('restores defaults only after apply and supports cancelling that draft', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[1].originalName);
    expect(editor().value).toBe('已命名乙');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认名称' }));
    expect(editor().value).toBe('');
    expect(editor().disabled).toBe(false);
    expect(nodes[1].customName).toBe('已命名乙');
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(within(nodeRow(nodes[1].originalName)).getByText('已命名乙')).toBeTruthy();
    openEditor(nodes[1].originalName);
    fireEvent.click(screen.getByRole('button', { name: '恢复默认名称' }));
    apply();
    expect(within(nodeRow(nodes[1].originalName)).getByText(nodes[1].defaultName)).toBeTruthy();
    expect(nodes[1].customName).toBe('已命名乙');
  });

  it('preserves unsaved drafts on row switching and permits switching after cancel or apply', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[0].originalName);
    edit('未应用的名称');
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` }));
    expect(alertText()).toContain('请先应用或取消当前修改。');
    expect(editor().value).toBe('未应用的名称');
    expect(within(nodeRow(nodes[0].originalName)).getByRole('textbox', { name: '对外显示名称' })).toBe(editor());
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` }));
    expect(editor().value).toBe('已命名乙');
    edit('已应用乙');
    apply();
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[0].originalName}` }));
    expect(editor().value).toBe('');
    expect(within(nodeRow(nodes[1].originalName)).getByText('已应用乙')).toBeTruthy();
  });

  it('allows switching after trim-equivalent input but preserves invalid control-character drafts until cancelled', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[0].originalName);
    edit('  ');
    expect((screen.getByRole('button', { name: '应用到本地预览' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` }));
    expect(editor().value).toBe('已命名乙');
    edit('  已命名乙  ');
    expect((screen.getByRole('button', { name: '应用到本地预览' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[0].originalName}` }));
    expect(editor().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();

    edit('\u200b');
    expect(editor().getAttribute('aria-invalid')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` }));
    expect(alertText()).toContain('请先应用或取消当前修改。');
    expect(editor().value).toBe('\u200b');
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` }));
    expect(editor().value).toBe('已命名乙');
  });

  it('shows an accessible validation error, disables invalid apply and clears the error on cancel', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[0].originalName);
    edit('已命名乙');
    expect(editor().getAttribute('aria-invalid')).toBe('true');
    expect(editor().getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/[\u3400-\u9fff]/u);
    expect((screen.getByRole('button', { name: '应用到本地预览' }) as HTMLButtonElement).disabled).toBe(true);
    expect(nodes[0].customName).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(within(nodeRow(nodes[0].originalName)).getByText(nodes[0].defaultName)).toBeTruthy();
    openEditor(nodes[0].originalName);
    expect(editor().getAttribute('aria-invalid')).not.toBe('true');
  });

  it('preserves a filtered-out dirty row and offers a global return-to-edit action that clears both filters', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[0].originalName);
    edit('筛选期间保留的草稿');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '完全不存在的合成节点' } });
    expect(screen.queryAllByRole('button', { name: /^编辑 / })).toHaveLength(0);
    expect(screen.getByText(/没有.*节点|暂无.*节点|未找到.*节点|无匹配.*节点|未匹配.*节点/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/未.*修改|编辑.*筛选|草稿/);
    fireEvent.click(screen.getByRole('button', { name: '返回编辑行' }));
    expect((screen.getByRole('textbox', { name: '搜索节点' }) as HTMLInputElement).value).toBe('');
    expect(editor().value).toBe('筛选期间保留的草稿');
    expect(screen.getAllByRole('row')).toHaveLength(4);
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'Hy2' } });
    expect(screen.getAllByRole('button', { name: /^编辑 / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` }));
    expect(alertText()).toContain('请先应用或取消当前修改。');
    fireEvent.click(screen.getByRole('button', { name: '返回编辑行' }));
    expect((screen.getByRole('combobox', { name: '协议筛选' }) as HTMLSelectElement).value).toBe('');
    expect(editor().value).toBe('筛选期间保留的草稿');
    expect(within(nodeRow(nodes[0].originalName)).getByRole('textbox', { name: '对外显示名称' })).toBe(editor());
    apply();
    expect(within(nodeRow(nodes[0].originalName)).getByText('筛选期间保留的草稿')).toBeTruthy();
  });

  it('supports Enter to apply and Escape to cancel directly in the edited row', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[0].originalName);
    edit('键盘确认名称');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(within(nodeRow(nodes[0].originalName)).getByText('键盘确认名称')).toBeTruthy();
    openEditor(nodes[0].originalName);
    edit('键盘取消草稿');
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(within(nodeRow(nodes[0].originalName)).getByText('键盘确认名称')).toBeTruthy();
    openEditor(nodes[0].originalName);
    expect(editor().value).toBe('键盘确认名称');
    edit('已命名乙');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(editor().getAttribute('aria-invalid')).toBe('true');
    expect(editor().value).toBe('已命名乙');
  });

  it('does not submit or cancel while a Chinese input method is composing', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[0].originalName);
    edit('输入法候选名称');
    fireEvent.keyDown(editor(), { key: 'Enter', isComposing: true });
    expect(editor().value).toBe('输入法候选名称');
    fireEvent.keyDown(editor(), { key: 'Escape', isComposing: true });
    expect(editor().value).toBe('输入法候选名称');
    expect(nodes[0].customName).toBeNull();
    fireEvent.keyDown(editor(), { key: 'Enter', keyCode: 229 });
    expect(editor().value).toBe('输入法候选名称');
    fireEvent.keyDown(editor(), { key: 'Enter', keyCode: 13 });
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(within(nodeRow(nodes[0].originalName)).getByText('输入法候选名称')).toBeTruthy();
  });

  it('does not make network or browser-storage calls during editing and resets after remount', () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const socketSpy = vi.fn();
    const eventSourceSpy = vi.fn();
    const beaconSpy = vi.fn();
    const indexedDbOpenSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('XMLHttpRequest', xhrSpy);
    vi.stubGlobal('WebSocket', socketSpy);
    vi.stubGlobal('EventSource', eventSourceSpy);
    vi.stubGlobal('indexedDB', { open: indexedDbOpenSpy });
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beaconSpy });
    const storageSpies = [
      vi.spyOn(Storage.prototype, 'getItem'), vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'), vi.spyOn(Storage.prototype, 'clear'), vi.spyOn(Storage.prototype, 'key'),
    ];
    const nodes = frozenFixture();
    const view = render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    openEditor(nodes[0].originalName);
    edit('临时本地名称');
    apply();
    expect(within(nodeRow(nodes[0].originalName)).getByText('临时本地名称')).toBeTruthy();
    view.unmount();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    expect(within(nodeRow(nodes[0].originalName)).getByText(nodes[0].defaultName)).toBeTruthy();
    for (const spy of [fetchSpy, xhrSpy, socketSpy, eventSourceSpy, beaconSpy, indexedDbOpenSpy, ...storageSpies]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('renders an empty initial list without an unusable editor', () => {
    render(<ThirdPartyNodeNamesPage initialNodes={[]} />);
    expect(screen.getByRole('heading', { name: '第三方节点命名' })).toBeTruthy();
    expect(screen.getByText(/没有.*节点|暂无.*节点|未找到.*节点|无.*节点/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(screen.queryByRole('button', { name: '应用到本地预览' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^编辑 / })).toHaveLength(0);
  });
});
