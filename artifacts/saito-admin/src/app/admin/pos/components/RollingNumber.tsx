'use client';

import { useMemo, useRef, useEffect } from 'react';

interface RollingNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  duration?: number;
}

const DIGIT_HEIGHT = '1.15em';

export function RollingNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
  duration = 0.3,
}: RollingNumberProps) {
  const formatted = useMemo(() => {
    const fixed = value.toFixed(decimals);
    const parts = fixed.split('.');
    const intPart = parts[0] || '0';
    const decPart = parts[1] || '';
    const digits = intPart.split('');
    if (decimals > 0) {
      digits.push('.');
      decPart.split('').forEach(ch => digits.push(ch));
    }
    return digits;
  }, [value, decimals]);

  const prevDigitsRef = useRef<string[]>([]);
  const prevValueRef = useRef<number | null>(null);
  const isFirstRender = prevValueRef.current === null;

  const changed = !isFirstRender && prevDigitsRef.current.join('') !== formatted.join('');

  useEffect(() => {
    prevValueRef.current = value;
    prevDigitsRef.current = formatted;
  });

  return (
    <span className={`inline-flex items-baseline ${className}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix && <span>{prefix}</span>}
      <span className="inline-flex" style={{ lineHeight: DIGIT_HEIGHT }}>
        {formatted.map((ch, i) => {
          if (ch === '.') {
            return (
              <span
                key={`dot-${i}`}
                className="inline-block overflow-hidden relative"
                style={{ width: '0.35em', height: DIGIT_HEIGHT, lineHeight: DIGIT_HEIGHT }}
              >
                <span className="absolute inset-0 flex items-center justify-center">
                  .
                </span>
              </span>
            );
          }

          const prevDigit = changed ? (prevDigitsRef.current[i] ?? ch) : ch;
          const digitChanged = isFirstRender || prevDigit !== ch;

          if (!digitChanged) {
            return (
              <span
                key={`static-${i}-${ch}`}
                className="inline-block overflow-hidden relative"
                style={{ width: '0.65em', height: DIGIT_HEIGHT, lineHeight: DIGIT_HEIGHT }}
              >
                <span className="absolute inset-0 flex items-center justify-center">
                  {ch}
                </span>
              </span>
            );
          }

          return (
            <span
              key={`slot-${i}-${ch}`}
              className="inline-block overflow-hidden relative"
              style={{ width: '0.65em', height: DIGIT_HEIGHT, lineHeight: DIGIT_HEIGHT }}
            >
              <span
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  animation: `rollIn ${duration}s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                }}
              >
                {ch}
              </span>
            </span>
          );
        })}
      </span>
      {suffix && (
        <span
          className="inline-block overflow-hidden relative"
          style={{ width: '0.65em', height: DIGIT_HEIGHT, lineHeight: DIGIT_HEIGHT }}
        >
          <span className="absolute inset-0 flex items-center justify-center">
            {suffix}
          </span>
        </span>
      )}
    </span>
  );
}
