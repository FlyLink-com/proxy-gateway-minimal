import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyNode } from '../features/third-party-node-names/node-name-model';
import { ThirdPartyNodeNamesPage, type ThirdPartyNodePersistence } from '../features/third-party-node-names/third-party-node-names-page';

const originalSendBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon');

function fixture(): ThirdPartyNode[] {
  return [
    { id: 'toolbar-a', sourceName: '合成来源甲', originalName: '工具栏节点甲', defaultName: '默认显示甲', customName: null, countryCode: 'JP', protocol: 'VLESS' },
    { id: 'toolbar-b', sourceName: '合成来源乙', originalName: '工具栏节点乙', defaultName: '默认显示乙', customName: '自定义显示乙', countryCode: 'SG', protocol: 'Hy2' },
  ];
}

function saveButton() {
  return screen.getByRole('button', { name: '保存节点列表' }) as HTMLButtonElement;
}

function enableButton() {
  return screen.getByRole('button', { name: '启用节点列表' }) as HTMLButtonElement;
}

function editor() {
  return screen.getByRole('textbox', { name: '对外显示名称' }) as HTMLInputElement;
}

function edit(originalName: string, draft: string) {
  fireEvent.click(screen.getByRole('button', { name: `编辑 ${originalName}` }));
  fireEvent.change(editor(), { target: { value: draft } });
}

function applyRow() {
  fireEvent.click(screen.getByRole('button', { name: '应用到本地预览' }));
}

function statusText() {
  return screen.getAllByRole('status').map((element) => element.textContent).join(' ');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalSendBeacon) Object.defineProperty(navigator, 'sendBeacon', originalSendBeacon);
  else Reflect.deleteProperty(navigator, 'sendBeacon');
});

describe('third-party node local list toolbar', () => {
  it('allows an initial nonempty snapshot but requires saving before local enablement', () => {
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} />);
    expect(saveButton().disabled).toBe(false);
    expect(enableButton().disabled).toBe(true);
    fireEvent.click(enableButton());
    expect(statusText()).not.toMatch(/已启用/);
    fireEvent.click(saveButton());
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(false);
    expect(statusText()).toMatch(/本地/);
    fireEvent.click(enableButton());
    expect(statusText()).toMatch(/已启用.*本地预览/);
    expect(saveButton().disabled).toBe(true);
  });

  it('separates applying one row from saving and enabling the full list', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    edit(nodes[0].originalName, '新的列表展示甲');
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(true);
    applyRow();
    expect(screen.getByText('新的列表展示甲')).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
    expect(enableButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(false);
  });

  it('blocks both toolbar actions on valid or invalid unsaved row drafts without discarding the previous snapshot', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    fireEvent.click(saveButton());
    edit(nodes[0].originalName, '待处理草稿');
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(true);
    fireEvent.change(editor(), { target: { value: '自定义显示乙' } });
    expect(editor().getAttribute('aria-invalid')).toBe('true');
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(false);
    expect(screen.queryByText('待处理草稿')).toBeNull();
  });

  it('blocks toolbar actions while deletion is pending and preserves the snapshot when deletion is cancelled', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: `删除 ${nodes[1].originalName}` }));
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '取消删除' }));
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(false);
  });

  it('invalidates local enablement after applying a later rename until the new list is saved and enabled again', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    fireEvent.click(saveButton());
    fireEvent.click(enableButton());
    edit(nodes[0].originalName, '启用后重新改名');
    applyRow();
    expect(statusText()).not.toMatch(/已启用/);
    expect(saveButton().disabled).toBe(false);
    expect(enableButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(enableButton().disabled).toBe(false);
    fireEvent.click(enableButton());
    expect(statusText()).toMatch(/已启用.*本地预览/);
  });

  it('invalidates a saved and enabled snapshot when a node is deleted', () => {
    const nodes = fixture();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    fireEvent.click(saveButton());
    fireEvent.click(enableButton());
    fireEvent.click(screen.getByRole('button', { name: `删除 ${nodes[1].originalName}` }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(screen.queryByRole('button', { name: `删除 ${nodes[1].originalName}` })).toBeNull();
    expect(saveButton().disabled).toBe(false);
    expect(enableButton().disabled).toBe(true);
    expect(statusText()).not.toMatch(/已启用/);
    fireEvent.click(saveButton());
    expect(enableButton().disabled).toBe(false);
    fireEvent.click(enableButton());
    expect(statusText()).toMatch(/已启用.*本地预览/);
  });

  it('does not invalidate a saved full-list snapshot just because filters change or produce no matches', () => {
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} />);
    fireEvent.click(saveButton());
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'TUIC' } });
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '无匹配节点' } });
    expect(screen.getByRole('heading', { name: '没有匹配的节点' })).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(false);
    fireEvent.click(enableButton());
    expect(statusText()).toMatch(/已启用.*本地预览/);
  });

  it('never enables an empty list, including after deleting the last previously enabled node', () => {
    const [node] = fixture();
    const view = render(<ThirdPartyNodeNamesPage initialNodes={[]} />);
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(true);
    view.unmount();
    render(<ThirdPartyNodeNamesPage initialNodes={[node]} />);
    fireEvent.click(saveButton());
    fireEvent.click(enableButton());
    fireEvent.click(screen.getByRole('button', { name: `删除 ${node.originalName}` }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(enableButton().disabled).toBe(true);
    expect(statusText()).not.toMatch(/已启用/);
  });

  it('uses only an in-memory snapshot, preserves frozen input and resets save/enable state after remount', () => {
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
    edit(nodes[0].originalName, '临时保存和启用的名称');
    applyRow();
    fireEvent.click(saveButton());
    fireEvent.click(enableButton());
    expect(statusText()).toMatch(/已启用.*本地预览/);
    expect(JSON.stringify(nodes)).toBe(before);
    view.unmount();
    render(<ThirdPartyNodeNamesPage initialNodes={nodes} />);
    expect(saveButton().disabled).toBe(false);
    expect(enableButton().disabled).toBe(true);
    expect(statusText()).not.toMatch(/已启用/);
    expect(screen.queryByText('临时保存和启用的名称')).toBeNull();
    expect(screen.getByText('默认显示甲')).toBeTruthy();
    for (const spy of [fetchSpy, xhrSpy, socketSpy, eventSourceSpy, beaconSpy, indexedDbOpenSpy, ...storageSpies]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('third-party source toolbar state', () => {
  function controls(overrides: Partial<ThirdPartyNodePersistence> = {}): ThirdPartyNodePersistence {
    return { enabled: true, busy: false, onSave: vi.fn(), onEnable: vi.fn(), onDisable: vi.fn(), importAction: null, ...overrides };
  }

  it('shows a pause action for an enabled source and waits for the owner to confirm state', () => {
    const persistence = controls();
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={persistence} />);
    const pause = screen.getByRole('button', { name: '暂停来源' });
    expect(pause.textContent).toBe('暂停来源');
    expect(pause.querySelector('svg.lucide-pause')).toBeTruthy();
    expect(screen.getByText('已启用 · 后台')).toBeTruthy();
    fireEvent.click(pause);
    expect(persistence.onDisable).toHaveBeenCalledExactlyOnceWith();
    expect(persistence.onEnable).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '暂停来源' })).toBeTruthy();
  });

  it('shows a play action for a paused source without optimistic enablement', () => {
    const persistence = controls({ enabled: false });
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={persistence} />);
    expect(enableButton().textContent).toBe('启用来源');
    expect(enableButton().querySelector('svg.lucide-play')).toBeTruthy();
    fireEvent.click(enableButton());
    expect(persistence.onEnable).toHaveBeenCalledExactlyOnceWith();
    expect(persistence.onDisable).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '暂停来源' })).toBeNull();
  });

  it('keeps pause available for an empty enabled source but blocks it while busy', () => {
    const persistence = controls();
    const view = render(<ThirdPartyNodeNamesPage initialNodes={[]} persistence={persistence} />);
    expect((screen.getByRole('button', { name: '暂停来源' }) as HTMLButtonElement).disabled).toBe(false);
    view.rerender(<ThirdPartyNodeNamesPage initialNodes={[]} persistence={{ ...persistence, busy: true }} />);
    const pause = screen.getByRole('button', { name: '暂停来源' }) as HTMLButtonElement;
    expect(pause.disabled).toBe(true);
    fireEvent.click(pause);
    expect(persistence.onDisable).not.toHaveBeenCalled();
  });
});
