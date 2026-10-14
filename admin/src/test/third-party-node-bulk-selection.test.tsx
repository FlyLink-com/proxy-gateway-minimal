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

  it('allows selected enabled nodes only when the owner explicitly supports confirmed pause-before-delete', () => {
    const controls = persistence({ bulkPauseBeforeDelete: true });
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    expect(remove().disabled).toBe(true);
    fireEvent.click(checkbox('选择 节点甲'));
    fireEvent.click(checkbox('选择 节点丙'));
    expect(remove().disabled).toBe(false);
    expect(remove().title).toContain('确认后先暂停');
    expect(screen.getByText(/选中节点中有 1 个仍启用.*确认后先暂停.*未选中节点不变/)).toBeTruthy();
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).toHaveBeenCalledExactlyOnceWith(['bulk-a', 'bulk-c']);
    expect(Object.isFrozen(vi.mocked(controls.onDeleteNodes).mock.calls[0][0])).toBe(true);
    expect(controls.onSetNodeEnabled).not.toHaveBeenCalled();
    expect(controls.onDeleteNode).not.toHaveBeenCalled();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it.each(['busy', 'placeholder', 'editing', 'invalid', 'unsaved', 'single-delete'])('pause-before-delete cannot bypass the %s guard', reason => {
    const controls = persistence({ enabled: false, bulkPauseBeforeDelete: true });
    const view = render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls} />);
    fireEvent.click(checkbox('选择 节点丙'));
    if (reason === 'busy' || reason === 'placeholder') {
      view.rerender(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={{ ...controls,
        ...(reason === 'busy' ? { busy: true } : { placeholder: { title: '未就绪', description: '合成状态' } }) }} />);
    } else if (reason === 'single-delete') {
      fireEvent.click(screen.getByRole('button', { name: '删除 节点甲' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: '编辑 节点乙' }));
      if (reason !== 'editing') fireEvent.change(screen.getByRole('textbox', { name: '对外显示名称' }), { target: { value: reason === 'invalid' ? '默认甲' : '未保存名称' } });
      if (reason === 'unsaved') fireEvent.click(screen.getByRole('button', { name: '应用到待保存列表' }));
    }
    expect(remove().disabled).toBe(true);
    expect(checkAll().disabled).toBe(true);
    fireEvent.click(remove());
    expect(controls.onDeleteNodes).not.toHaveBeenCalled();
    expect(controls.onSetNodeEnabled).not.toHaveBeenCalled();
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

describe('third-party selected-node lifecycle toolbar', () => {
  const enable = () => screen.getByRole('button', { name: '启用选中节点' }) as HTMLButtonElement;
  const pause = () => screen.getByRole('button', { name: '暂停选中节点' }) as HTMLButtonElement;
  function controls(overrides: Partial<ThirdPartyNodePersistence> = {}) {
    return persistence({ selectionActionsOnly: true, bulkPauseBeforeDelete: true, onDisable: vi.fn(), onSetNodesEnabled: vi.fn(), ...overrides });
  }

  it('merges lifecycle actions into three icon controls and removes row/source actions', () => {
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={controls()} />);
    const toolbar = screen.getByRole('group', { name: '节点列表操作' });
    expect(within(toolbar).getByRole('button', { name: '启用选中节点' })).toBe(enable());
    expect(enable().querySelector('svg.lucide-play')).toBeTruthy();
    expect(pause().querySelector('svg.lucide-pause')).toBeTruthy();
    expect(remove().querySelector('svg.lucide-trash2')).toBeTruthy();
    expect(enable().classList.contains('tp-names-cancel-soft')).toBe(true);
    expect(pause().classList.contains('tp-names-danger-soft')).toBe(true);
    for (const action of [enable(), pause(), remove()]) {
      expect(action.disabled).toBe(true);
      expect(action.textContent).toBe('');
      expect(action.title).not.toBe('');
    }
    expect(screen.queryByRole('button', { name: '暂停来源' })).toBeNull();
    expect(screen.queryByRole('button', { name: '启用节点列表' })).toBeNull();
    for (const node of NODES) {
      expect(screen.queryByRole('button', { name: `删除 ${node.originalName}` })).toBeNull();
      expect(screen.queryByRole('button', { name: `停用节点 ${node.originalName}` })).toBeNull();
      expect(screen.queryByRole('button', { name: `启用节点 ${node.originalName}` })).toBeNull();
      expect(screen.getByRole('button', { name: `编辑 ${node.originalName}` })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: `国家/地区 ${node.originalName}` })).toBeTruthy();
    }
    expect(screen.queryByRole('region', { name: '删除节点确认' })).toBeNull();
  });

  it('supports one selected paused node without calling source or row callbacks', () => {
    const owner = controls();
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={owner} />);
    fireEvent.click(checkbox('选择 节点甲'));
    expect(enable().disabled).toBe(false);
    expect(pause().disabled).toBe(true);
    fireEvent.click(enable());
    expect(owner.onSetNodesEnabled).toHaveBeenCalledExactlyOnceWith(['bulk-a'], true);
    expect(Object.isFrozen(vi.mocked(owner.onSetNodesEnabled!).mock.calls[0][0])).toBe(true);
    expect(owner.onSetNodeEnabled).not.toHaveBeenCalled();
    expect(owner.onEnable).not.toHaveBeenCalled();
    expect(owner.onDisable).not.toHaveBeenCalled();
    expect(owner.onDeleteNode).not.toHaveBeenCalled();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('pauses one selected enabled node and disables actions again after cancelling selection', () => {
    const owner = controls();
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={owner} />);
    fireEvent.click(checkbox('选择 节点丙'));
    expect(enable().disabled).toBe(true);
    expect(pause().disabled).toBe(false);
    fireEvent.click(pause());
    expect(owner.onSetNodesEnabled).toHaveBeenCalledExactlyOnceWith(['bulk-c'], false);
    expect(screen.getByLabelText('节点状态 节点丙').textContent).toBe('分发中');
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
    for (const action of [enable(), pause(), remove()]) { expect(action.disabled).toBe(true); fireEvent.click(action); }
    expect(owner.onSetNodesEnabled).toHaveBeenCalledTimes(1);
    expect(owner.onDeleteNodes).not.toHaveBeenCalled();
  });

  it.each([true, false])('acts only on selected nodes needing the requested change while source enabled=%s', enabled => {
    const owner = controls({ enabled });
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={owner} />);
    fireEvent.click(checkAll());
    expect(enable().disabled).toBe(false);
    expect(pause().disabled).toBe(false);
    fireEvent.click(enable());
    expect(owner.onSetNodesEnabled).toHaveBeenNthCalledWith(1, ['bulk-a', 'bulk-b'], true);
    fireEvent.click(pause());
    expect(owner.onSetNodesEnabled).toHaveBeenNthCalledWith(2, ['bulk-c'], false);
    fireEvent.click(remove());
    expect(owner.onDeleteNodes).toHaveBeenCalledExactlyOnceWith(['bulk-a', 'bulk-b', 'bulk-c']);
    expect(owner.onSetNodeEnabled).not.toHaveBeenCalled();
    expect(owner.onEnable).not.toHaveBeenCalled();
    expect(owner.onDisable).not.toHaveBeenCalled();
    expect(owner.onDeleteNode).not.toHaveBeenCalled();
    expect(NODES.map(node => node.enabled)).toEqual([false, false, true]);
  });

  it('does not carry selected targets across filtering or revision remounts', () => {
    const owner = controls();
    const view = render(<ThirdPartyNodeNamesPage key="one" initialNodes={NODES} persistence={owner} />);
    fireEvent.click(checkAll());
    fireEvent.change(screen.getByRole('combobox', { name: '协议筛选' }), { target: { value: 'Hy2' } });
    expect(enable().disabled).toBe(true);
    expect(pause().disabled).toBe(true);
    fireEvent.click(checkAll());
    fireEvent.click(enable());
    expect(owner.onSetNodesEnabled).toHaveBeenCalledExactlyOnceWith(['bulk-b'], true);
    view.rerender(<ThirdPartyNodeNamesPage key="two" initialNodes={NODES} persistence={owner} />);
    expect(enable().disabled).toBe(true);
    expect(pause().disabled).toBe(true);
    expect(remove().disabled).toBe(true);
  });

  it.each(['busy', 'placeholder', 'editing', 'invalid', 'unsaved'])('blocks all selection actions in %s state', reason => {
    const owner = controls({ enabled: false });
    const view = render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={owner} />);
    fireEvent.click(checkAll());
    if (reason === 'busy' || reason === 'placeholder') {
      view.rerender(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={{ ...owner,
        ...(reason === 'busy' ? { busy: true } : { placeholder: { title: '未就绪', description: '合成状态' } }) }} />);
    } else {
      fireEvent.click(screen.getByRole('button', { name: '编辑 节点乙' }));
      if (reason !== 'editing') fireEvent.change(screen.getByRole('textbox', { name: '对外显示名称' }), { target: { value: reason === 'invalid' ? '默认甲' : '未保存名称' } });
      if (reason === 'unsaved') fireEvent.click(screen.getByRole('button', { name: '应用到待保存列表' }));
    }
    for (const action of [enable(), pause(), remove()]) { expect(action.disabled).toBe(true); fireEvent.click(action); }
    expect(owner.onSetNodesEnabled).not.toHaveBeenCalled();
    expect(owner.onDeleteNodes).not.toHaveBeenCalled();
    expect(owner.onSetNodeEnabled).not.toHaveBeenCalled();
    expect(owner.onEnable).not.toHaveBeenCalled();
    expect(owner.onDisable).not.toHaveBeenCalled();
  });

  it('disables missing capabilities rather than falling back to source or row operations', () => {
    const owner = controls({ onSetNodesEnabled: undefined });
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={owner} />);
    fireEvent.click(checkAll());
    expect(enable().disabled).toBe(true);
    expect(pause().disabled).toBe(true);
    expect(remove().disabled).toBe(false);
    fireEvent.click(enable());
    fireEvent.click(pause());
    expect(owner.onSetNodeEnabled).not.toHaveBeenCalled();
    expect(owner.onEnable).not.toHaveBeenCalled();
    expect(owner.onDisable).not.toHaveBeenCalled();
  });

  it('supports selection with lifecycle-only capability and keeps delete disabled', () => {
    const owner = controls({ onDeleteNodes: undefined });
    render(<ThirdPartyNodeNamesPage initialNodes={NODES} persistence={owner} />);
    fireEvent.click(checkAll());
    expect(enable().disabled).toBe(false);
    expect(pause().disabled).toBe(false);
    expect(remove().disabled).toBe(true);
    fireEvent.click(remove());
    expect(owner.onDeleteNode).not.toHaveBeenCalled();
  });
});
