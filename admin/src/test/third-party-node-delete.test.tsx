import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyNode } from '../features/third-party-node-names/node-name-model';
import { ThirdPartyNodeNamesPage } from '../features/third-party-node-names/third-party-node-names-page';

const originalSendBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon');

function fixture(): ThirdPartyNode[] {
  return [
    { id: 'delete-a', sourceName: '合成来源甲', originalName: '删除测试节点甲', defaultName: '默认节点甲', customName: null, countryCode: 'JP', protocol: 'VLESS' },
    { id: 'delete-b', sourceName: '合成来源乙', originalName: '删除测试节点乙', defaultName: '默认节点乙', customName: '已命名节点乙', countryCode: 'SG', protocol: 'Hy2' },
    { id: 'delete-c', sourceName: '合成来源甲', originalName: '删除测试节点丙', defaultName: '默认节点丙', customName: null, countryCode: 'US', protocol: 'TUIC' },
  ];
}

function deleteButton(originalName: string) {
  return screen.getByRole('button', { name: `删除 ${originalName}` }) as HTMLButtonElement;
}

function requestDelete(originalName: string) {
  fireEvent.click(deleteButton(originalName));
  return screen.getByRole('region', { name: '删除节点确认' });
}

function confirmDelete() {
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
}

function cancelDelete() {
  fireEvent.click(screen.getByRole('button', { name: '取消删除' }));
}

function editor() {
  return screen.getByRole('textbox', { name: '对外显示名称' }) as HTMLInputElement;
}

function editNode(originalName: string, draft: string) {
  fireEvent.click(screen.getByRole('button', { name: `编辑 ${originalName}` }));
  fireEvent.change(editor(), { target: { value: draft } });
}

function listCount() {
  return screen.getByRole('heading', { level: 2, name: /节点列表/ }).textContent;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalSendBeacon) Object.defineProperty(navigator, 'sendBeacon', originalSendBeacon);
  else Reflect.deleteProperty(navigator, 'sendBeacon');
});

describe('third-party node local deletion', () => {
  it('offers icon-only per-row deletion and slides a compact confirmation into the same operation cell', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    expect(screen.getAllByRole('button', { name: /^删除 / })).toHaveLength(3);
    for (const button of screen.getAllByRole('button', { name: /^删除 / })) {
      expect(button.textContent?.trim()).toBe('');
      expect(button.querySelector('svg')).toBeTruthy();
    }
    const confirmationRegion = requestDelete(nodes[1].originalName);
    const confirmation = within(confirmationRegion);
    const row = screen.getByRole('row', { name: new RegExp(nodes[1].originalName) });
    expect(confirmationRegion.closest('tr')).toBe(row);
    expect(within(row).getAllByRole('cell')[4].contains(confirmationRegion)).toBe(true);
    expect(confirmation.getByRole('button', { name: '确认删除' }).textContent).toBe('删除');
    expect(confirmation.getByRole('button', { name: '取消删除' }).textContent).toBe('取消');
    expect(confirmation.queryByRole('heading')).toBeNull();
    expect(screen.getByText(/本地预览.*刷新后恢复/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(listCount()).toMatch(/3\s*\/\s*3/);
  });

  it('cancels without removing a node and restores keyboard focus to the initiating button', async () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    const button = deleteButton(nodes[1].originalName);
    button.focus();
    requestDelete(nodes[1].originalName);
    cancelDelete();
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^删除 / })).toHaveLength(3);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('Escape cancels only deletion and preserves an existing edit draft', async () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    editNode(nodes[0].originalName, '尚未保存的节点名');
    const button = deleteButton(nodes[0].originalName);
    requestDelete(nodes[0].originalName);
    fireEvent.keyDown(screen.getByRole('button', { name: '取消删除' }), { key: 'Escape' });
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(editor().value).toBe('尚未保存的节点名');
    expect(screen.getAllByRole('row')).toHaveLength(4);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('cancelling the confirmation preserves the current row and draft', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    editNode(nodes[0].originalName, '取消删除后仍在的草稿');
    requestDelete(nodes[0].originalName);
    cancelDelete();
    expect(editor().value).toBe('取消删除后仍在的草稿');
    expect(screen.getByRole('button', { name: '应用到本地预览' })).toBeTruthy();
    expect(deleteButton(nodes[0].originalName)).toBeTruthy();
  });

  it('removes exactly the confirmed node and focuses search after confirmation', async () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    requestDelete(nodes[1].originalName);
    confirmDelete();
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(screen.queryByRole('button', { name: `删除 ${nodes[1].originalName}` })).toBeNull();
    expect(deleteButton(nodes[0].originalName)).toBeTruthy();
    expect(deleteButton(nodes[2].originalName)).toBeTruthy();
    expect(listCount()).toMatch(/2\s*\/\s*2/);
    expect(screen.getByRole('status').textContent).toMatch(/本地/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '搜索节点' })));
  });

  it('deleting the currently edited node discards only that now-removed edit state', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    editNode(nodes[0].originalName, '将被删除的草稿');
    requestDelete(nodes[0].originalName);
    confirmDelete();
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    expect(screen.queryByRole('button', { name: '应用到本地预览' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[1].originalName}` }));
    expect(editor().value).toBe('已命名节点乙');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('deleting a different node preserves the existing draft and dirty-switch protection', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    editNode(nodes[0].originalName, '保留另一行的草稿');
    requestDelete(nodes[1].originalName);
    confirmDelete();
    expect(editor().value).toBe('保留另一行的草稿');
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[2].originalName}` }));
    expect(screen.getByRole('alert').textContent).toContain('请先应用或取消当前修改。');
    expect(editor().value).toBe('保留另一行的草稿');
    fireEvent.click(screen.getByRole('button', { name: '应用到本地预览' }));
    expect(screen.getByText('保留另一行的草稿')).toBeTruthy();
    expect(screen.queryByRole('button', { name: `删除 ${nodes[1].originalName}` })).toBeNull();
  });

  it('locks edit and competing delete actions while confirmation is pending', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    requestDelete(nodes[0].originalName);
    for (const button of screen.getAllByRole('button', { name: /^(删除|编辑) / })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(deleteButton(nodes[1].originalName));
    fireEvent.click(screen.getByRole('button', { name: `编辑 ${nodes[2].originalName}` }));
    expect(screen.getByRole('region', { name: '删除节点确认' }).closest('tr')?.textContent).toContain(nodes[0].originalName);
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    cancelDelete();
    for (const button of screen.getAllByRole('button', { name: /^(删除|编辑) / })) {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('cancels pending deletion when protocol filters hide its target, preventing hidden deletion', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'Hy2' } });
    expect(listCount()).toMatch(/1\s*\/\s*3/);
    requestDelete(nodes[1].originalName);
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'VLESS' } });
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(screen.queryByRole('button', { name: '确认删除' })).toBeNull();
    expect(deleteButton(nodes[0].originalName)).toBeTruthy();
    expect(listCount()).toMatch(/1\s*\/\s*3/);
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'Hy2' } });
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(deleteButton(nodes[1].originalName).disabled).toBe(false);
    requestDelete(nodes[1].originalName);
    confirmDelete();
    expect(listCount()).toMatch(/0\s*\/\s*2/);
    expect(screen.getByRole('heading', { name: '没有匹配的节点' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: '' } });
    expect(deleteButton(nodes[0].originalName)).toBeTruthy();
    expect(deleteButton(nodes[2].originalName)).toBeTruthy();
    expect(screen.queryByRole('button', { name: `删除 ${nodes[1].originalName}` })).toBeNull();
  });

  it('handles removal of the final node with an empty list and no stale controls', () => {
    const [node] = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={[node]} />);
    requestDelete(node.originalName);
    confirmDelete();
    expect(listCount()).toMatch(/0\s*\/\s*0/);
    expect(screen.queryAllByRole('button', { name: /^(删除|编辑) / })).toHaveLength(0);
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(screen.getByRole('heading', { name: /暂无.*节点/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '导入' })).toBeTruthy();
  });

  it('uses stable identity rather than original name when two imported nodes share a name', () => {
    const nodes = fixture();
    nodes[0].originalName = '共享原名';
    nodes[1].originalName = '共享原名';
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    const targetRow = screen.getByRole('row', { name: /共享原名.*Hy2/ });
    fireEvent.click(within(targetRow).getByRole('button', { name: '删除 共享原名' }));
    expect(screen.getByRole('region', { name: '删除节点确认' }).closest('tr')?.textContent).toContain('已命名节点乙');
    confirmDelete();
    expect(screen.queryByRole('row', { name: /共享原名.*Hy2/ })).toBeNull();
    expect(screen.getByRole('row', { name: /共享原名.*VLESS/ })).toBeTruthy();
    expect(deleteButton(nodes[2].originalName)).toBeTruthy();
    expect(listCount()).toMatch(/2\s*\/\s*2/);
  });

  it('searching away from a pending target cancels its confirmation without deleting or losing a draft', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    editNode(nodes[0].originalName, '筛选后保留的草稿');
    requestDelete(nodes[1].originalName);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: nodes[0].originalName } });
    expect(screen.queryByRole('button', { name: `删除 ${nodes[1].originalName}` })).toBeNull();
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(screen.queryByRole('button', { name: '确认删除' })).toBeNull();
    expect(editor().value).toBe('筛选后保留的草稿');
    expect(listCount()).toMatch(/1\s*\/\s*3/);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '' } });
    expect(deleteButton(nodes[1].originalName)).toBeTruthy();
  });

  it('returning to a filtered-out edit row cancels another pending deletion and preserves both nodes and the draft', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    editNode(nodes[0].originalName, '返回编辑行后仍保留的草稿');
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'Hy2' } });
    expect(screen.queryByRole('textbox', { name: '对外显示名称' })).toBeNull();
    requestDelete(nodes[1].originalName);
    fireEvent.click(screen.getByRole('button', { name: '返回编辑行' }));
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(screen.queryByRole('button', { name: '确认删除' })).toBeNull();
    expect(editor().value).toBe('返回编辑行后仍保留的草稿');
    expect(editor().disabled).toBe(false);
    expect(deleteButton(nodes[0].originalName)).toBeTruthy();
    expect(deleteButton(nodes[1].originalName)).toBeTruthy();
    expect(listCount()).toMatch(/3\s*\/\s*3/);
  });

  it('disables the draft and all edit actions until confirmation is cancelled', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    editNode(nodes[0].originalName, '确认期间保留的草稿');
    requestDelete(nodes[1].originalName);
    expect(editor().disabled).toBe(true);
    for (const name of ['应用到本地预览', '恢复默认名称', '取消修改']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    cancelDelete();
    expect(editor().disabled).toBe(false);
    expect(editor().value).toBe('确认期间保留的草稿');
    for (const name of ['应用到本地预览', '恢复默认名称', '取消修改']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('changes only in-memory state, never touches network or storage, and restores original nodes after remount', () => {
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
    const nodes = Object.freeze(fixture().map((node) => Object.freeze(node)));
    const before = JSON.stringify(nodes);
    const view = render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    requestDelete(nodes[1].originalName);
    confirmDelete();
    expect(screen.getAllByRole('button', { name: /^删除 / })).toHaveLength(2);
    expect(JSON.stringify(nodes)).toBe(before);
    view.unmount();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    expect(screen.getAllByRole('button', { name: /^删除 / })).toHaveLength(3);
    expect(deleteButton(nodes[1].originalName)).toBeTruthy();
    for (const spy of [fetchSpy, xhrSpy, socketSpy, eventSourceSpy, beaconSpy, indexedDbOpenSpy, ...storageSpies]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
