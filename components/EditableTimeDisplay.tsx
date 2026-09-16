import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Colors } from '@/constants/Colors';
import { hapticImpact } from '@/utils/haptics';

interface Props {
  valueMs: number;
  disabled: boolean;
  onConfirm: (ms: number) => void;
  // Countdown display: 8m44.7s reads 8m45s (commits still use exact typed values)
  ceilDisplay?: boolean;
  isFocused?: boolean;
  onFocusedChange?: (focused: boolean) => void;
  // Use smaller text/narrower segments to fit inside a constrained container
}

type Seg = 'h' | 'm' | 's';
type SegMap = Record<Seg, number>;
const ORDER: Seg[] = ['h', 'm', 's'];

function split(ms: number): SegMap {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

const totalMs = (g: SegMap) => (g.h * 3600 + g.m * 60 + g.s) * 1000;

export default function EditableTimeDisplay({
  valueMs,
  disabled,
  onConfirm,
  ceilDisplay,
  isFocused,
  onFocusedChange,
}: Props) {
  const [active, setActive] = useState<Seg | null>(null);
  const [draft, setDraft] = useState('');
  // Working copy — keeps multi-segment edits consistent without waiting for parent re-render
  const worked = useRef<SegMap | null>(null);
  const advancing = useRef(false);
  // Last committed {seg, digits} — stops the auto-blur/submit after a 2-digit
  // auto-commit from committing the same digits a second time (95s → +2m bug).
  const lastCommit = useRef<{ seg: Seg; digits: string } | null>(null);
  const hRef = useRef<TextInput>(null);
  const mRef = useRef<TextInput>(null);
  const sRef = useRef<TextInput>(null);
  const refOf = (s: Seg) => (s === 'h' ? hRef : s === 'm' ? mRef : sRef);

  // Sync external isFocused -> blur when parent requests unfocus (e.g. tap on empty area)
  useEffect(() => {
    if (isFocused === false && active !== null) {
      refOf(active).current?.blur();
    }
  }, [isFocused, active]);

  const segs = split(ceilDisplay ? Math.ceil(valueMs / 1000) * 1000 : valueMs);

  const close = useCallback(() => {
    worked.current = null;
    lastCommit.current = null;
    setActive(null);
    setDraft('');
    onFocusedChange?.(false);
  }, [onFocusedChange]);

  // Overflow normalizes naturally: 90m -> 1h30m, 95s -> 1m35s
  const commit = useCallback(
    (seg: Seg, digits: string) => {
      const base = worked.current ?? segs;
      const next = split(totalMs({ ...base, [seg]: Number(digits) }));
      worked.current = next;
      lastCommit.current = { seg, digits };
      onConfirm(totalMs(next));
    },
    [segs, onConfirm]
  );

  const alreadyCommitted = useCallback(
    (seg: Seg, digits: string) =>
      lastCommit.current?.seg === seg && lastCommit.current?.digits === digits,
    []
  );

  const focusSeg = useCallback(
    (seg: Seg) => {
      if (disabled) return;
      hapticImpact();
      if (!worked.current) worked.current = { ...segs };
      lastCommit.current = null;
      setActive(seg);
      onFocusedChange?.(true);
      // Prefill + select-all so focus shows both digits selected.
      setDraft(String(worked.current[seg]).padStart(2, '0'));
    },
    [disabled, segs, onFocusedChange]
  );

  const advanceFrom = useCallback(
    (seg: Seg) => {
      const i = ORDER.indexOf(seg);
      if (i < ORDER.length - 1) {
        advancing.current = true;
        refOf(ORDER[i + 1]).current?.focus();
      } else {
        refOf(seg).current?.blur();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const changeSeg = useCallback(
    (seg: Seg, text: string) => {
      const raw = text.replace(/[^0-9]/g, '');
      // Selection-replace gives the fresh digits directly ("05" selected + "3" → "3").
      // If the platform appends instead of replacing ("05" + "3" → "053"),
      // keep only the last typed digit so one keystroke can't auto-commit/advance.
      const digits = raw.length > 2 ? raw.slice(-1) : raw.slice(0, 2);
      setDraft(raw);
      if (digits.length === 2) {
        commit(seg, digits);
        advanceFrom(seg);
      }
    },
    [commit, advanceFrom]
  );

  const blurSeg = useCallback(() => {
    if (advancing.current) {
      advancing.current = false;
      return;
    }
    // if (draft !== '' && !alreadyCommitted(seg, draft)) commit(seg, draft);
    close();
  }, [draft, commit, close, alreadyCommitted]);

  const submitSeg = useCallback(
    (seg: Seg) => {
      if (draft !== '' && !alreadyCommitted(seg, draft)) commit(seg, draft);
      advanceFrom(seg);
    },
    [draft, commit, advanceFrom, alreadyCommitted]
  );

  const segProps = (seg: Seg) => {
    const display = String(segs[seg]).padStart(2, '0');
    const editing = active === seg;
    // Show the live draft while editing, otherwise the committed value.
    return { value: editing ? draft : display, editing };
  };

  return (
    <View className="my-2 flex-row items-center justify-center">
      {/* {showH && ( */}
      {/*   <> */}
      <TimeSeg
        ref={hRef}
        {...segProps('h')}
        disabled={disabled}
        returnKey="next"
        onFocus={() => focusSeg('h')}
        onChangeText={(t) => changeSeg('h', t)}
        onBlur={() => blurSeg()}
        onSubmit={() => submitSeg('h')}
      />
      <Text
        className={`text-center text-4xl font-black tracking-tight text-text `}
        style={{ width: 14, lineHeight: 64 }}>
        :
      </Text>
      {/*   </> */}
      {/* )} */}
      <TimeSeg
        ref={mRef}
        {...segProps('m')}
        disabled={disabled}
        returnKey="next"
        onFocus={() => focusSeg('m')}
        onChangeText={(t) => changeSeg('m', t)}
        onBlur={() => blurSeg()}
        onSubmit={() => submitSeg('m')}
      />
      <Text
        className={`text-center text-4xl font-black tracking-tight text-text `}
        style={{ width: 14, lineHeight: 64 }}>
        :
      </Text>
      <TimeSeg
        ref={sRef}
        {...segProps('s')}
        disabled={disabled}
        returnKey="done"
        onFocus={() => focusSeg('s')}
        onChangeText={(t) => changeSeg('s', t)}
        onBlur={() => blurSeg()}
        onSubmit={() => submitSeg('s')}
      />
    </View>
  );
}

const TimeSeg = React.forwardRef<
  TextInput,
  {
    value: string;
    editing: boolean;
    disabled: boolean;
    returnKey: 'next' | 'done';
    onFocus: () => void;
    onChangeText: (text: string) => void;
    onBlur: () => void;
    onSubmit: () => void;
  }
>(function TimeSeg(
  { value, editing, disabled, returnKey, onFocus, onChangeText, onBlur, onSubmit },
  ref
) {
  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      onSubmitEditing={onSubmit}
      editable={!disabled}
      keyboardType="numeric"
      returnKeyType={returnKey}
      selectTextOnFocus
      showSoftInputOnFocus={!disabled}
      caretHidden={!editing}
      maxLength={2}
      scrollEnabled={false}
      multiline={false}
      allowFontScaling={false}
      textContentType="none"
      contextMenuHidden
      className={`${editing ? 'bg-primary/20' : 'bg-transparent'} overflow-hidden rounded-xl text-center text-5xl font-black tabular-nums text-text `}
      style={{
        width: 68,
        height: 64,
      }}
    />
  );
});
