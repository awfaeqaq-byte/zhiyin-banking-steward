import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {StewardVoice} from './steward-voice';
import * as transport from '../lib/voice-connection';
import {initialVoiceState, type VoiceState} from '../lib/realtime-voice';

afterEach(() => vi.restoreAllMocks());

function voiceHarness() {
  let current = {...initialVoiceState};
  let notify: (state: VoiceState) => void = () => undefined;
  const start = vi.fn(async () => {
    current = {...initialVoiceState, phase: 'connecting'};
    notify(current);
  });
  const stop = vi.fn(() => {
    current = {...initialVoiceState};
    notify(current);
  });
  vi.spyOn(transport, 'createVoiceConnection').mockImplementation(options => {
    notify = options.onState;
    return {
      start, stop,
      setMuted: muted => {
        current = {...current, muted};
        notify(current);
      },
      play: vi.fn(async () => undefined),
      getState: () => current,
    };
  });
  render(<StewardVoice stewardName="宁宁" stewardImage="/n.png" onRequest={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: '和宁宁语音对话'}));
  return {
    start, stop,
    emit(patch: Partial<VoiceState>) {
      act(() => {
        current = {...current, ...patch};
        notify(current);
      });
    },
    begin() { fireEvent.click(screen.getByRole('button', {name: '开始语音对话'})); },
  };
}

describe('语音界面的状态表达与可选字幕', () => {
  it('关闭字幕不会结束或重连通话，隐藏期间的新内容在重新打开时仍可查看', () => {
    const call = voiceHarness();
    call.begin();
    call.emit({phase: 'listening', heard: '看看这个月的支出', answer: '可以，我先核对账单。'});
    expect(screen.getByText('看看这个月的支出')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: '关闭字幕'}));
    const hiddenPrevious = screen.queryByText('看看这个月的支出');
    if (hiddenPrevious) expect(hiddenPrevious).not.toBeVisible();
    call.emit({heard: '只看餐饮这一项', answer: '好的，按餐饮分类查看。'});
    const hiddenLatest = screen.queryByText('只看餐饮这一项');
    if (hiddenLatest) expect(hiddenLatest).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: '显示字幕'}));
    expect(screen.getByText('只看餐饮这一项')).toBeVisible();
    expect(screen.getByText('好的，按餐饮分类查看。')).toBeVisible();
    expect(call.start).toHaveBeenCalledOnce();
    expect(call.stop).not.toHaveBeenCalled();
  });

  it('连接中收起面板仍如实显示正在连接，不冒充已经接通', () => {
    const call = voiceHarness();
    call.begin();
    fireEvent.click(screen.getByRole('button', {name: '收起语音面板'}));
    const bar = screen.getByRole('region', {name: '持续语音通话'});
    expect(within(bar).getByText('正在连接…')).toBeVisible();
    expect(bar).not.toHaveTextContent('通话中');
    expect(bar).not.toHaveTextContent('可以继续说');
    expect(call.stop).not.toHaveBeenCalled();
    expect(call.start).toHaveBeenCalledOnce();
  });

  it('尚未连接时提供取消连接，并真正停止连接流程', () => {
    const call = voiceHarness();
    call.begin();
    expect(screen.queryByRole('button', {name: '结束对话'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '取消连接'}));
    expect(call.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', {name: '开始语音对话'})).toBeEnabled();
  });

  it('连接中收起后失败仍保留恢复入口，重新展开能看见原因且不会自动重连', () => {
    const call = voiceHarness();
    call.begin();
    fireEvent.click(screen.getByRole('button', {name: '收起语音面板'}));
    call.emit({phase: 'error', error: '语音连接中断，请检查网络后重试。'});
    expect(screen.getByText('语音连接中断')).toBeVisible();
    const resume = screen.getByRole('button', {name: '展开语音通话'});
    expect(resume).toBeVisible();
    expect(call.start).toHaveBeenCalledOnce();
    fireEvent.click(resume);
    expect(screen.getByRole('alert')).toHaveTextContent('请检查网络后重试');
    expect(screen.getByRole('button', {name: '开始语音对话'})).toHaveTextContent('重新连接');
    expect(call.start).toHaveBeenCalledOnce();
  });

  it('失败后主操作明确显示重新连接，点击会重新发起一次连接', () => {
    const call = voiceHarness();
    call.begin();
    call.emit({phase: 'error', error: '连接中断，请检查网络后重试。'});
    expect(screen.getByRole('alert')).toHaveTextContent('连接中断');
    const retry = screen.getByRole('button', {name: '开始语音对话'});
    expect(retry).toHaveTextContent('重新连接');
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(call.start).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', {name: '取消连接'})).toBeInTheDocument();
  });

  it('连接失败时保留最后双方字幕用于核对，残留讲话状态不再触发声音动效', () => {
    const call = voiceHarness();
    call.begin();
    call.emit({phase: 'listening', heard: '帮我看看这个月的餐饮支出', answer: '正在核对餐饮记录。'});
    call.emit({phase: 'error', error: '网络连接中断，请重新连接。', userSpeaking: true});
    expect(screen.getByText('帮我看看这个月的餐饮支出')).toBeVisible();
    expect(screen.getByText('正在核对餐饮记录。')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('网络连接中断');
    const presence = screen.getByRole('region', {name: '语音对话'}).querySelector('.voice-presence');
    expect(presence).toHaveAttribute('data-motion', 'quiet');
    expect(call.start).toHaveBeenCalledOnce();
  });

  it.each<{
    description: string; state: Partial<VoiceState>; motion: 'quiet' | 'speaking';
  }>([
    {description: '尚未开启', state: {phase: 'idle'}, motion: 'quiet'},
    {description: '正在连接', state: {phase: 'connecting'}, motion: 'quiet'},
    {description: '等待用户讲话', state: {phase: 'listening'}, motion: 'quiet'},
    {description: '仅在后台处理', state: {phase: 'working', pending: 1}, motion: 'quiet'},
    {description: '连接失败', state: {phase: 'error', error: '无法连接'}, motion: 'quiet'},
    {description: '宁宁正在播报', state: {phase: 'speaking'}, motion: 'speaking'},
    {description: '用户正在讲话', state: {phase: 'listening', userSpeaking: true}, motion: 'speaking'},
    {description: '静音时残留用户讲话状态', state: {phase: 'listening', userSpeaking: true, muted: true}, motion: 'quiet'},
    {description: '浏览器暂停了回应声音', state: {phase: 'speaking', notice: '浏览器暂停了声音，请点播放声音。'}, motion: 'quiet'},
  ])('$description：声音动效与实际状态一致', ({state, motion}) => {
    const call = voiceHarness();
    call.emit(state);
    const presence = screen.getByRole('region', {name: '语音对话'}).querySelector('.voice-presence');
    expect(presence).toHaveAttribute('data-motion', motion);
  });
});
