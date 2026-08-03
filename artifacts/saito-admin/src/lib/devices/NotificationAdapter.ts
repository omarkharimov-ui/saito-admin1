import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

export class NotificationAdapter implements IDeviceAdapter {
  type: DeviceType = 'notification';

  supports(type: DeviceType): boolean {
    return type === 'notification';
  }

  async print(_job: any): Promise<boolean> {
    return false;
  }

  async notify(_title: string, _body: string): Promise<boolean> {
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(_title, { body: _body });
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'ready';
  }
}
