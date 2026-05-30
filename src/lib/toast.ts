import { toast as hotToast } from 'react-hot-toast';

function msgId(msg: string): string {
  return msg.replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, '_').toLowerCase().slice(0, 80);
}

function to(method: 'success' | 'error', msg: string, opts?: any) {
  const id = opts?.id ?? msgId(msg);
  return hotToast[method](msg, { ...opts, id });
}

export function toast(msg: string, opts?: any) {
  const id = opts?.id ?? msgId(msg);
  return hotToast(msg, { ...opts, id });
}

toast.success = (msg: string, opts?: any) => to('success', msg, opts);
toast.error = (msg: string, opts?: any) => to('error', msg, opts);
