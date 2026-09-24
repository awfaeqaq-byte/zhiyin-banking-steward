import * as TimeService from '@/os/TimeService';

const pad = (value: number) => String(value).padStart(2, '0');

const dateFor = (occurredAt: string) => TimeService.fromTimestamp(Date.parse(occurredAt));

export const getWechatPayMonthKey = (occurredAt: string) => {
  const date = dateFor(occurredAt);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

export const getWechatPayDateKey = (occurredAt: string) => {
  const date = dateFor(occurredAt);
  return `${getWechatPayMonthKey(occurredAt)}-${pad(date.getDate())}`;
};

export const getWechatPayTimeLabel = (occurredAt: string) => {
  const date = dateFor(occurredAt);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const getWechatPayDateTimeLabel = (occurredAt: string) => {
  const date = dateFor(occurredAt);
  return `${getWechatPayDateKey(occurredAt)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
