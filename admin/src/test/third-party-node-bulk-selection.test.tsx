import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThirdPartyNodeNamesPage } from '../features/third-party-node-names/third-party-node-names-page';
import type { ThirdPartyNodePersistence } from '../features/third-party-node-names/third-party-node-names-page';
import type { ThirdPartyNode } from '../features/third-party-node-names/node-name-model';

const NODES: readonly ThirdPartyNode[] = Object.freeze([
  Object.freeze({ id: 'bulk-a', sourceName: '合成来源', originalName: '节点甲', defaultName: '默认甲', customName: null, countryCode: 'JP', protocol: 'VLESS', enabled: false }),
  Object.freeze({ id: 'bulk-b', sourceName: '合成来源', originalName: '节点乙', defaultName: '默认乙', customName: null, countryCode: 'SG', protocol: 'Hy2', enabled: false }),
  Object.freeze({ id: 'bulk-c', sourceName: '合成来源', originalName: '节点丙', defaultName: '默认丙', customName: null, countryCode: 'US', protocol: 'VLESS', enabled: true }),
]);
function persistence(overrides: Partial<ThirdPartyNodePersistence> = {}) {
  return { enabled: true, busy: false, onSave: vi.fn(), onEnable: vi.fn(), onSetNodeEnabled: vi.fn(),
    onDeleteNode: vi.fn(), onDeleteNodes: vi.fn(), importAction: <button type="button">导入</button>, ...overrides };
}
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const checkAll = () => checkbox('选择当前筛选的全部节点');
const remove = () => screen.getByRole('button', { name: '删除选中节点' }) as HTMLButtonElement;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('third-party node confirmed-server bulk selection', () => {
  it('places an icon-only delete control beside import and starts with no selection', () => {
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={persistence()} />);
    const toolbar = screen.getByRole('group', { name: '节点列表操作' });
    expect(within(toolbar).getByRole('button', { name: '导入' }).nextElementSibling).toBe(remove());
    expect(remove().textContent).toBe('');
    expect(remove().querySelector('svg')).toBeTruthy();
    expect(remove().classList.contains('tp-names-danger-soft')).toBe(true);
    expect(remove().disabled).toBe(true);
    expect(checkAll().checked).toBe(false);
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('select-all is limited to visible rows and never selects a hidden active node', () => {
    const controls = persistence();
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'Hy2' } });
    fireEvent.click(checkAll());
    expect(checkbox('选择 节点乙').checked).toBe(true);
    expect(checkAll().checked).toBe(true);
    expect(remove().disabled).toBe(false);
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).toHaveBeenCalledExactlyOnceWith(['bulk-b']);
    expect(Object.isFrozen(vi.mocked(controls.onDeleteNodes).mock.calls[0][0])).toBe(true);
    expect(controls.onDeleteNode).not.toHaveBeenCalled();
    expect(controls.onSetNodeEnabled).not.toHaveBeenCalled();
  });

  it('represents partial selection, cancels it and keeps node inputs unchanged', () => {
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={persistence()} />);
    fireEvent.click(checkbox('选择 节点甲'));
    expect(checkAll().indeterminate).toBe(true);
    expect(checkAll().checked).toBe(false);
    expect(screen.getByText('已选择 1 个节点')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
    expect(checkAll().indeterminate).toBe(false);
    expect(screen.getAllByRole('checkbox').every(node => !(node as HTMLInputElement).checked)).toBe(true);
    expect(remove().disabled).toBe(true);
    expect(NODES).toHaveLength(3);
    expect(NODES[0].enabled).toBe(false);
  });

  it.each(['search', 'protocol'])('clears selection whenever %s filtering changes', (kind) => {
    const controls = persistence();
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    fireEvent.click(checkbox('选择 节点甲'));
    if (kind === 'search') fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '节点乙' } });
    else fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'Hy2' } });
    expect(remove().disabled).toBe(true);
    expect(checkAll().checked).toBe(false);
    expect(checkAll().indeterminate).toBe(false);
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).not.toHaveBeenCalled();
  });

  it('lets enabled rows be selected but blocks the entire deletion without automatically pausing', () => {
    const controls = persistence();
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    fireEvent.click(checkAll());
    expect(checkbox('选择 节点丙').checked).toBe(true);
    expect(remove().disabled).toBe(true);
    expect(screen.getByText(/选中节点中有 1 个仍启用.*请先逐个停用/)).toBeTruthy();
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).not.toHaveBeenCalled();
    expect(controls.onSetNodeEnabled).not.toHaveBeenCalled();
    fireEvent.click(checkbox('选择 节点丙'));
    expect(remove().disabled).toBe(false);
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).toHaveBeenCalledExactlyOnceWith(['bulk-a', 'bulk-b']);
  });

  it.each([true, false])('allows only paused-node deletion whether source enabled=%s', enabled => {
    const controls = persistence({ enabled });
    render(<ThirdPartyNodeNamesPage initialNodes={NODES.slice(0, 2)} persistence={controls} />);
    fireEvent.click(checkAll());
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).toHaveBeenCalledExactlyOnceWith(['bulk-a', 'bulk-b']);
    expect(screen.getAllByRole('row')).toHaveLength(3); // Confirmation/mutation belongs to owner.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['busy', 'placeholder'])('blocks selection and deletion with %s state', reason => {
    const controls = persistence();
    const view = render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    fireEvent.click(checkbox('选择 节点甲'));
    view.rerender(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={{ ...controls,
      ...(reason === 'busy' ? { busy: true } : { placeholder: { title: '未就绪', description: '合成状态' } }) }} />);
    expect(checkAll().disabled).toBe(true);
    expect(checkbox('选择 节点甲').disabled).toBe(true);
    expect(remove().disabled).toBe(true);
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).not.toHaveBeenCalled();
  });

  it('blocks deletion throughout editing and after an applied unsaved draft', () => {
    const controls = persistence({ enabled: false });
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    fireEvent.click(checkbox('选择 节点甲'));
    fireEvent.click(screen.getByRole('button', { name: '编辑 节点乙' }));
    expect(remove().disabled).toBe(true);
    expect(checkAll().disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '对外显示名称' }), { target: { value: '新的草稿名称' } });
    fireEvent.click(screen.getByRole('button', { name: '应用到待保存列表' }));
    expect(remove().disabled).toBe(true);
    expect(checkAll().disabled).toBe(true);
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).not.toHaveBeenCalled();
  });

  it('cannot bypass the original single-row confirmation or trigger a bulk call from it', () => {
    const controls = persistence();
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    fireEvent.click(checkbox('选择 节点乙'));
    fireEvent.click(screen.getByRole('button', { name: '删除 节点甲' }));
    expect(remove().disabled).toBe(true);
    expect(checkAll().disabled).toBe(true);
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(controls.onDeleteNode).toHaveBeenCalledExactlyOnceWith('bulk-a');
    expect(controls.onDeleteNodes).not.toHaveBeenCalled();
  });

  it('does not expose bulk controls without a server callback, including local preview', () => {
    const view = render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={persistence({ onDeleteNodes: undefined })} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '删除选中节点' })).toBeNull();
    view.rerender(<ThirdPartyNodeNamesPage initialNodes={NODES} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '取消选择' })).toBeNull();
  });

  it('disables header selection for an empty filter and clears selection on source revision remount', () => {
    const controls = persistence();
    const view = render(<ThirdPartyNodeNamesPage key="revision-one" initialNodes={NODES} persistence={controls} />);
    fireEvent.click(checkbox('选择 节点甲'));
    view.rerender(<ThirdPartyNodeNamesPage key="revision-two" initialNodes={NODES} persistence={controls} />);
    expect(checkbox('选择 节点甲').checked).toBe(false);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索节点' }), { target: { value: '不存在' } });
    expect(checkAll().disabled).toBe(true);
    expect(remove().disabled).toBe(true);
  });
});
