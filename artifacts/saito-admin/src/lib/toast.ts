export type { Toast, DefaultToastOptions, ToastPosition, ToastType } from 'react-hot-toast';
export { Toaster, useToaster, useToasterStore, ToastBar, ToastIcon, resolveValue } from 'react-hot-toast';
import { toast as hotToast } from 'react-hot-toast';

function msgId(msg: string): string {
  return msg.replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, '_').toLowerCase().slice(0, 80);
}

function to(method: 'success' | 'error', msg: string, opts?: any) {
  const id = opts?.id ?? msgId(msg);
  return hotToast[method](msg, { ...opts, id });
}

type ToastMsg = string | ((t: any) => any);

function toastFn(msg: ToastMsg, opts?: any) {
  if (typeof msg === 'function') return hotToast(msg, opts);
  const id = opts?.id ?? msgId(msg);
  return hotToast(msg, { ...opts, id });
}

toastFn.success = (msg: ToastMsg, opts?: any) => {
  if (typeof msg === 'function') return hotToast.success(msg, opts);
  return to('success', msg, opts);
};

toastFn.error = (msg: ToastMsg, opts?: any) => {
  if (typeof msg === 'function') return hotToast.error(msg, opts);
  return to('error', msg, opts);
};

toastFn.custom = (msg: ToastMsg, opts?: any) => hotToast.custom(msg, opts);
toastFn.dismiss = (id?: string) => hotToast.dismiss(id);
toastFn.remove = (id?: string) => hotToast.remove(id);

export { toastFn as toast };
export default toastFn;