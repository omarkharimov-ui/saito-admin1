/**
 * @deprecated Use @/lib/i18n/LanguageContext instead.
 * This legacy provider is no longer used anywhere in the app.
 * Scheduled for removal in the next cleanup pass.
 */

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'AZ' | 'EN' | 'RU';

interface Translations {
  [key: string]: {
    [key in Language]: string;
  };
}

const translations: Translations = {
  // Navbar
  'nav.menu': { AZ: 'Menyu', EN: 'Menu', RU: 'Меню' },
  'nav.about': { AZ: 'Haqqımızda', EN: 'About', RU: 'О нас' },
  'nav.reservation': { AZ: 'Rezervasiya', EN: 'Reservation', RU: 'Бронирование' },
  
  // Hero
  'hero.title': { AZ: 'Premium Sushi Təcrübəsi', EN: 'Premium Sushi Experience', RU: 'Премиальный Суши Опыт' },
  'hero.subtitle': { AZ: 'Saito: Dadın Fəlsəfəsi', EN: 'Saito: Philosophy of Taste', RU: 'Saito: Философия Вкуса' },
  'hero.cta': { AZ: 'Menyunu Kəşf Et', EN: 'Explore Menu', RU: 'Посмотреть Меню' },
  
  // About Page
  'about.story': { AZ: 'Hekayəmiz', EN: 'Our Story', RU: 'Наша История' },
  'about.title': { AZ: 'Saito: Dadın Fəlsəfəsi', EN: 'Saito: Philosophy of Taste', RU: 'Saito: Философия Вкуса' },
  'about.desc': { AZ: 'Saito sadəcə bir restoran deyil, bu bir premium sushi təcrübəsidir. Biz yapon mətbəxinin ənənələrini müasir estetikayla birləşdirərək sənət əsərləri yaradırıq.', EN: 'Saito is not just a restaurant, it is a premium sushi experience. We combine Japanese traditions with modern aesthetics to create works of art.', RU: 'Saito — это не просто ресторан, это премиальный суши-опыт. Мы сочетаем японские традиции с современной эстетикой, создавая произведения искусства.' },
  'about.passion': { AZ: 'Mükəmməlliyə olan ehtirasımız', EN: 'Our Passion for Excellence', RU: 'Наша Страсть к Совершенству' },
  
  // Reservation Page
  'res.title': { AZ: 'Masa Rezervasiyası', EN: 'Table Reservation', RU: 'Бронирование Стола' },
  'res.subtitle': { AZ: 'Masa Rezervi', EN: 'Table Booking', RU: 'Резерв Стола' },
  'res.desc': { AZ: 'Özəl anlarınızı Saito-da qeyd edin. Masanızı öncədən sifariş edərək vaxtınıza qənaət edin.', EN: 'Celebrate your special moments at Saito. Save time by pre-booking your table.', RU: 'Отпразднуйте свои особые моменты в Saito. Сэкономьте время, забронировав стол заранее.' },
  'res.name': { AZ: 'Adınız və Soyadınız', EN: 'Full Name', RU: 'Имя и Фамилия' },
  'res.phone': { AZ: 'Telefon Nömrəsi', EN: 'Phone Number', RU: 'Номер Телефона' },
  'res.date': { AZ: 'Tarix Seçimi', EN: 'Date Selection', RU: 'Выбор Даты' },
  'res.time': { AZ: 'Saat Seçimi', EN: 'Time Selection', RU: 'Выбор Времени' },
  'res.guests': { AZ: 'Qonaq Sayı', EN: 'Number of Guests', RU: 'Количество Гостей' },
  'res.guests.other': { AZ: 'Digər (Manual)', EN: 'Other (Manual)', RU: 'Другое (Вручную)' },
  'res.guests.count': { AZ: 'Qonaq Sayını Daxil Edin', EN: 'Enter Guest Count', RU: 'Введите количество гостей' },
  'res.notes': { AZ: 'Qeyd (Opsional)', EN: 'Notes (Optional)', RU: 'Заметки (Опционально)' },
  'res.submit': { AZ: 'Rezervasiyanı Tamamla', EN: 'Complete Reservation', RU: 'Завершить Бронирование' },
  'res.success.title': { AZ: 'Rezervasiya Alındı!', EN: 'Reservation Received!', RU: 'Бронирование Принято!' },
  'res.success.desc': { AZ: 'Sizinlə tezliklə əlaqə saxlayacağıq. Bizi seçdiyiniz üçün təşəkkürlər.', EN: 'We will contact you soon. Thank you for choosing us.', RU: 'Мы свяжемся с вами в ближайшее время. Спасибо за ваш выбор.' },
  'res.new': { AZ: 'Yeni Rezervasiya', EN: 'New Reservation', RU: 'Новое Бронирование' },
  
  // Wheel Picker Labels
  'picker.day': { AZ: 'GÜN', EN: 'DAY', RU: 'ДЕНЬ' },
  'picker.month': { AZ: 'AY', EN: 'MONTH', RU: 'МЕС' },
  'picker.year': { AZ: 'İL', EN: 'YEAR', RU: 'ГОД' },
  'picker.hour': { AZ: 'SAAT', EN: 'HOUR', RU: 'ЧАС' },
  'picker.min': { AZ: 'DƏQ', EN: 'MIN', RU: 'МИН' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('AZ');

  useEffect(() => {
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang && ['AZ', 'EN', 'RU'].includes(savedLang)) {
      setLanguage(savedLang);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};