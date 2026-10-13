import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyNode } from '../features/third-party-node-names/node-name-model';
import { ThirdPartyNodeNamesPage, type ThirdPartyNodePersistence } from '../features/third-party-node-names/third-party-node-names-page';

const nodes: ThirdPartyNode[] = [
  { id: 'a', sourceName: '合成来源', originalName: '原始日本', defaultName: '日本 01', customName: null, countryCode: 'JP', protocol: 'VLESS', enabled: true },
  { id: 'b', sourceName: '合成来源', originalName: '原始新加坡', defaultName: '新加坡 01', customName: null, countryCode: 'SG', protocol: 'Hy2', enabled: false },
];
function setup(overrides: Partial<ThirdPartyNodePersistence> = {}, initialNodes = nodes) {
  const persistence = { enabled: true, busy: false, onSave: vi.fn(), onEnable: vi.fn(), onDisable: vi.fn(), onSetNodeEnabled: vi.fn(), onDeleteNode: vi.fn(), onDirtyChange: vi.fn(), importAction: null, ...overrides };
  render(<ThirdPartyNodeNamesPage initialNodes={initialNodes} persistence={persistence} />);
  return persistence;
}
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
afterEach(cleanup);

describe('per-node lifecycle controls', () => {
  it('allows stopping one enabled node while its source stays enabled, without optimistic mutation', () => {
    const p = setup();
    expect(button('停用节点 原始日本').disabled).toBe(false);
    expect(button('停用节点 原始日本').textContent).toBe('');
    expect(button('停用节点 原始日本').querySelector('svg.lucide-pause')).toBeTruthy();
    expect(button('启用节点 原始新加坡').textContent).toBe('');
    expect(button('启用节点 原始新加坡').querySelector('svg.lucide-play')).toBeTruthy();
    fireEvent.click(button('停用节点 原始日本'));
    expect(p.onSetNodeEnabled).toHaveBeenCalledExactlyOnceWith('a', false);
    expect(p.onDisable).not.toHaveBeenCalled();
    expect(p.onSave).not.toHaveBeenCalled();
    expect(button('停用节点 原始日本')).toBeTruthy();
    expect(button('启用节点 原始新加坡')).toBeTruthy();
    expect(screen.getByText('分发中')).toBeTruthy();
    expect(screen.getByText('已停用')).toBeTruthy();
  });

  it('allows restoring just the disabled node while the source is enabled', () => {
    const p = setup();
    fireEvent.click(button('启用节点 原始新加坡'));
    expect(p.onSetNodeEnabled).toHaveBeenCalledExactlyOnceWith('b', true);
    expect(p.onEnable).not.toHaveBeenCalled();
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('requires a node to be disabled before direct deletion, even if the source is disabled', () => {
    const p = setup({ enabled: false });
    expect(button('删除 原始日本').disabled).toBe(true);
    expect(button('删除 原始日本').title).toContain('请先停用此节点');
    fireEvent.click(button('删除 原始日本'));
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
    expect(p.onDeleteNode).not.toHaveBeenCalled();
    expect(screen.getByText('待分发')).toBeTruthy();
  });

  it('confirms deletion of exactly the disabled node without marking the list dirty or requiring Save', () => {
    const p = setup();
    fireEvent.click(button('删除 原始新加坡'));
    const confirmation = screen.getByRole('region', { name: '删除节点确认' });
    expect(confirmation.closest('tr')?.textContent).toContain('原始新加坡');
    expect(p.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(confirmation.textContent).toContain('确认后立即');
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认删除' }));
    expect(p.onDeleteNode).toHaveBeenCalledExactlyOnceWith('b');
    expect(p.onSave).not.toHaveBeenCalled();
    expect(p.onDisable).not.toHaveBeenCalled();
    // Wait for confirmed server snapshot; never hide the row on a failed API write.
    expect(screen.getByRole('row', { name: /原始新加坡/ })).toBeTruthy();
  });

  it('cancels row deletion with Escape, without writes and unlocks other lifecycle buttons', () => {
    const p = setup();
    fireEvent.click(button('删除 原始新加坡'));
    expect(button('停用节点 原始日本').disabled).toBe(true);
    fireEvent.keyDown(button('取消删除'), { key: 'Escape' });
    expect(p.onDeleteNode).not.toHaveBeenCalled();
    expect(button('停用节点 原始日本').disabled).toBe(false);
  });

  it.each([
    { busy: true },
    { placeholder: { title: '未就绪', description: '未就绪' } },
  ])('blocks lifecycle actions for unavailable or busy snapshots: %j', (extra) => {
    const p = setup(extra);
    expect(button('停用节点 原始日本').disabled).toBe(true);
    expect(button('启用节点 原始新加坡').disabled).toBe(true);
    expect(button('删除 原始新加坡').disabled).toBe(true);
    fireEvent.click(button('停用节点 原始日本'));
    fireEvent.click(button('删除 原始新加坡'));
    expect(p.onSetNodeEnabled).not.toHaveBeenCalled();
    expect(p.onDeleteNode).not.toHaveBeenCalled();
  });

  it('blocks immediate operations while an unsaved country change exists', () => {
    const p = setup({ enabled: false });
    fireEvent.change(screen.getByRole('combobox', { name: '国家/地区 原始日本' }), { target: { value: 'US' } });
    expect(p.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(button('停用节点 原始日本').disabled).toBe(true);
    expect(button('删除 原始新加坡').disabled).toBe(true);
    fireEvent.click(button('停用节点 原始日本'));
    expect(p.onSetNodeEnabled).not.toHaveBeenCalled();
  });

  it('blocks immediate actions while editing a node, then allows them after cancel', () => {
    setup({ enabled: false });
    fireEvent.click(button('编辑 原始日本'));
    expect(button('停用节点 原始日本').disabled).toBe(true);
    expect(button('删除 原始新加坡').disabled).toBe(true);
    fireEvent.click(button('取消修改'));
    expect(button('停用节点 原始日本').disabled).toBe(false);
  });

  it('treats legacy snapshots without node enabled as enabled', () => {
    const legacy = nodes.map(({ enabled: _enabled, ...node }) => node);
    setup({}, legacy);
    expect(button('停用节点 原始日本')).toBeTruthy();
    expect(button('停用节点 原始新加坡')).toBeTruthy();
    expect(button('删除 原始新加坡').disabled).toBe(true);
  });
});
