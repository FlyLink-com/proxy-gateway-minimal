import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateNodeName, type ThirdPartyNode } from '../features/third-party-node-names/node-name-model';
import { ThirdPartyNodeNamesPage, type ThirdPartyNodePersistence } from '../features/third-party-node-names/third-party-node-names-page';

function fixture(): ThirdPartyNode[] {
  return [
    { id: 'connected-a', sourceName: '合成来源', originalName: '管理节点甲', defaultName: '默认甲', customName: null, countryCode: 'JP', protocol: 'VLESS' },
    { id: 'connected-b', sourceName: '合成来源', originalName: '管理节点乙', defaultName: '默认乙', customName: null, countryCode: 'US', protocol: 'Hy2' },
  ];
}

function persistence(overrides: Partial<ThirdPartyNodePersistence> = {}): ThirdPartyNodePersistence {
  return { enabled: false, busy: false, onSave: vi.fn(), onEnable: vi.fn(), onDirtyChange: vi.fn(), importAction: <button type="button">后台导入</button>, ...overrides };
}
function saveButton() { return screen.getByRole('button', { name: '保存节点列表' }) as HTMLButtonElement; }
function enableButton() { return screen.getByRole('button', { name: '启用节点列表' }) as HTMLButtonElement; }
function edit(value: string) {
  fireEvent.click(screen.getByRole('button', { name: '编辑 管理节点甲' }));
  fireEvent.change(screen.getByRole('textbox', { name: '对外显示名称' }), { target: { value } });
}
function apply() { fireEvent.click(screen.getByRole('button', { name: '应用到待保存列表' })); }
function remove(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `删除 ${name}` }));
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('authenticated third-party node editor delegation', () => {
  it('treats the initial server snapshot as saved and uses the supplied import action only', () => {
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={persistence()} />);
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(false);
    expect(screen.getByRole('button', { name: '后台导入' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '导入' })).toBeNull();
    expect(screen.queryByText('本地预览')).toBeNull();
    expect(screen.getByText('已保存 · 未启用')).toBeTruthy();
  });

  it('sends the complete retained list, not filtered rows, and does not assume save success', () => {
    const options = persistence();
    const initial = Object.freeze(fixture().map((node) => Object.freeze(node)));
    render(<ThirdPartyNodeNamesPage initialNodes={initial} persistence={options} />);
    edit('待存甲');
    apply();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '待存甲' } });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.click(saveButton());
    expect(options.onSave).toHaveBeenCalledWith([{ ...initial[0], customName: '待存甲' }, initial[1]]);
    expect(saveButton().disabled).toBe(false);
    expect(enableButton().disabled).toBe(true);
    expect(screen.getByText('未保存 · 草稿')).toBeTruthy();
    expect(initial[0].customName).toBeNull();
  });

  it('reports row drafts, deletion confirmation and full-list changes to the owner', () => {
    const options = persistence();
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={options} />);
    expect(options.onDirtyChange).toHaveBeenLastCalledWith(false);
    edit('尚未应用');
    expect(options.onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(options.onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: '删除 管理节点乙' }));
    expect(options.onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '取消删除' }));
    expect(options.onDirtyChange).toHaveBeenLastCalledWith(false);
    remove('管理节点乙');
    expect(options.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('status').textContent).toMatch(/草稿.*保存/);
  });

  it('allows saving deletion of all nodes but never enables an empty list', () => {
    const options = persistence();
    render(<ThirdPartyNodeNamesPage initialNodes={[fixture()[0]]} persistence={options} />);
    remove('管理节点甲');
    expect(saveButton().disabled).toBe(false);
    expect(enableButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(options.onSave).toHaveBeenCalledWith([]);
    expect(screen.getByRole('heading', { name: '暂无节点' })).toBeTruthy();
  });

  it('delegates enablement without showing success until server state arrives', () => {
    const options = persistence();
    const view = render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={options} />);
    fireEvent.click(enableButton());
    expect(options.onEnable).toHaveBeenCalledOnce();
    expect(enableButton().getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('已启用 · 后台')).toBeNull();
    view.rerender(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={{ ...options, enabled: true }} />);
    expect(enableButton().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('已启用 · 后台')).toBeTruthy();
  });

  it.each(['enabled', 'busy'] as const)('blocks changes when %s while keeping search usable', (blockedKey) => {
    const options = persistence({ [blockedKey]: true });
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={options} />);
    expect((screen.getByRole('button', { name: '编辑 管理节点甲' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '删除 管理节点甲' }) as HTMLButtonElement).disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '管理节点乙' } });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.click(saveButton()); fireEvent.click(enableButton());
    expect(options.onSave).not.toHaveBeenCalled();
    expect(options.onEnable).not.toHaveBeenCalled();
  });

  it('blocks existing editor and delete confirmation if a request begins', () => {
    const options = persistence();
    const initial = fixture();
    const view = render(<ThirdPartyNodeNamesPage initialNodes={initial} persistence={options} />);
    edit('草稿');
    fireEvent.click(screen.getByRole('button', { name: '删除 管理节点甲' }));
    view.rerender(<ThirdPartyNodeNamesPage initialNodes={initial} persistence={{ ...options, busy: true }} />);
    expect((screen.getByRole('textbox', { name: '对外显示名称' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认删除' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('keeps keyboard cancellation focus and never claims deleting a draft changed the backend', async () => {
    render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={persistence()} />);
    const opener = screen.getByRole('button', { name: '删除 管理节点乙' });
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole('button', { name: '取消删除' }), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(opener));
    remove('管理节点乙');
    expect(screen.getByRole('status').textContent).toContain('后台尚未改变');
  });

  it('restores a saved snapshot only when the owner remounts the editor after success', () => {
    const options = persistence();
    const view = render(<ThirdPartyNodeNamesPage initialNodes={fixture()} persistence={options} />);
    edit('已返回的名称'); apply(); fireEvent.click(saveButton());
    const saved = (options.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as ThirdPartyNode[];
    view.unmount();
    render(<ThirdPartyNodeNamesPage initialNodes={saved} persistence={options} />);
    expect(saveButton().disabled).toBe(true);
    expect(enableButton().disabled).toBe(false);
    expect(options.onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe('name length matches backend UTF-16 storage contract', () => {
  it('accepts 128 UTF-16 units and rejects names above the exact boundary', () => {
    const nodes = fixture();
    expect(validateNodeName(nodes, nodes[0].id, '🌏'.repeat(64)).error).toBeNull();
    expect(validateNodeName(nodes, nodes[0].id, '名'.repeat(128)).error).toBeNull();
    expect(validateNodeName(nodes, nodes[0].id, '🌏'.repeat(65)).error).toBeTruthy();
    expect(validateNodeName(nodes, nodes[0].id, '名'.repeat(129)).error).toBeTruthy();
  });
  it.each(['\ud800', '\udfff', '名\ud800称', '\ud800\ud800', '\udfff\ud800'])('rejects malformed UTF-16 without echoing it', (input) => {
    const nodes = fixture();
    const result = validateNodeName(nodes, nodes[0].id, input);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain(input);
  });
});
