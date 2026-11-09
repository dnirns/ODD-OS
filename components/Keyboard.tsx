import {
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  INITIAL_KEYBOARD,
  isLit,
  type KeyboardState,
  type Keystroke,
  press,
} from "../os/keyboard/keyboardState";
import { type KeyDef, keyName, LAYOUT, repeats } from "../os/keyboard/layout";
import { startRepeat } from "../os/keyboard/repeat";
import styles from "./Keyboard.module.css";

const KEYS = new Map(LAYOUT.flat().map((key) => [key.id, key]));

// The keystroke reaches the page as a physical key's would, so boot, the
// command line and every programme handle it without knowing about touch.
export const sendKeystroke = (stroke: Keystroke) => {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { ...stroke, bubbles: true, cancelable: true }),
  );
};

const span = (key: KeyDef) => ({ gridColumn: `span ${key.width * 4}` });

const Legend = ({ keyDef }: { keyDef: KeyDef }) => {
  switch (keyDef.kind) {
    case "character":
      return keyDef.shifted === keyDef.base.toUpperCase() ? (
        <span className={styles.cap}>{keyDef.shifted}</span>
      ) : (
        <span className={styles.cap}>
          <span>{keyDef.shifted}</span>
          <span>{keyDef.base}</span>
        </span>
      );
    case "modifier":
      return (
        <span className={styles.cap}>
          {keyDef.label}
          <span className={styles.led} />
        </span>
      );
    case "action":
      return <span className={styles.cap}>{keyDef.label}</span>;
    case "gap":
      return null;
  }
};

type KeyRowsProps = {
  modifiers: KeyboardState;
  pressed: readonly string[];
};

export const KeyRows = ({ modifiers, pressed }: KeyRowsProps) =>
  LAYOUT.map((row, rowIndex) => (
    <div key={rowIndex} className={styles.row}>
      {row.map((key) =>
        key.kind === "gap" ? (
          <span key={key.id} style={span(key)} aria-hidden="true" />
        ) : (
          <button
            key={key.id}
            type="button"
            tabIndex={-1}
            className={styles.key}
            style={span(key)}
            data-key={key.id}
            data-kind={key.kind}
            data-pressed={pressed.includes(key.id) || undefined}
            aria-label={keyName(key)}
            aria-pressed={key.kind === "modifier" ? isLit(modifiers, key.modifier) : undefined}
          >
            <Legend keyDef={key} />
          </button>
        ),
      )}
    </div>
  ));

type Held = {
  readonly keyId: string;
  readonly rect: DOMRect;
  readonly stopRepeat?: () => void;
};

type Popup = {
  readonly pointerId: number;
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

const keyAt = (target: EventTarget) =>
  target instanceof Element ? target.closest<HTMLButtonElement>("[data-key]") : null;

const isOutside = (rect: DOMRect, x: number, y: number) =>
  x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;

// A magnified copy of the key, above it and inside the keyboard's width.
const toPopup = (pointerId: number, text: string, rect: DOMRect, area: DOMRect): Popup => {
  const width = Math.max(rect.width * 1.7, 40);
  const height = rect.height * 1.35;
  const centre = rect.left + rect.width / 2 - area.left;
  return {
    pointerId,
    text,
    width,
    height,
    left: Math.min(Math.max(centre - width / 2, 0), area.width - width),
    top: rect.top - area.top - height,
  };
};

type KeyboardProps = {
  shown: boolean;
  onToggle: () => void;
};

const Keyboard = ({ shown, onToggle }: KeyboardProps) => {
  const [modifiers, setModifiers] = useState(INITIAL_KEYBOARD);
  const [pressed, setPressed] = useState<readonly string[]>([]);
  const [popup, setPopup] = useState<Popup>();
  // Fingers can land between renders, so the latest state lives here too.
  const modifiersRef = useRef(INITIAL_KEYBOARD);
  const held = useRef(new Map<number, Held>());
  const keysRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fingers = held.current;
    return () => {
      for (const finger of fingers.values()) finger.stopRepeat?.();
    };
  }, []);

  const pressKey = (key: KeyDef) => {
    const result = press(modifiersRef.current, key, performance.now());
    modifiersRef.current = result.state;
    setModifiers(result.state);
    if (result.stroke) sendKeystroke(result.stroke);
    return result.stroke;
  };

  const showPressed = () =>
    setPressed([...held.current.values()].map((finger) => finger.keyId));

  const release = (pointerId: number) => {
    const finger = held.current.get(pointerId);
    if (!finger) return;
    finger.stopRepeat?.();
    held.current.delete(pointerId);
    showPressed();
    setPopup((current) => (current?.pointerId === pointerId ? undefined : current));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const button = keyAt(event.target);
    const key = button && KEYS.get(button.dataset.key ?? "");
    if (!button || !key) return;

    // Keeps focus where it is and stops the browser's mouse emulation.
    event.preventDefault();
    release(event.pointerId);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // The pointer has already gone; its up event releases the key.
    }

    const stroke = pressKey(key);
    const rect = button.getBoundingClientRect();
    held.current.set(event.pointerId, {
      keyId: key.id,
      rect,
      stopRepeat: stroke && repeats(key) ? startRepeat(() => sendKeystroke(stroke)) : undefined,
    });
    showPressed();

    const area = keysRef.current?.getBoundingClientRect();
    if (stroke && key.kind === "character" && area) {
      setPopup(toPopup(event.pointerId, stroke.key, rect, area));
    }
  };

  // Sliding off a key lets it go; it never types the key it slides onto.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const finger = held.current.get(event.pointerId);
    if (finger && isOutside(finger.rect, event.clientX, event.clientY)) release(event.pointerId);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => release(event.pointerId);

  // Assistive technology activates a key with a click and no pointer.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.detail !== 0) return;
    const key = KEYS.get(keyAt(event.target)?.dataset.key ?? "");
    if (key) pressKey(key);
  };

  const onTabPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    // A touch elsewhere on the page shows the keyboard; this one toggles it.
    event.stopPropagation();
    onToggle();
  };

  const onTabClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) onToggle();
  };

  return (
    <div className={styles.keyboard} data-shown={shown}>
      <button
        type="button"
        tabIndex={-1}
        className={styles.tab}
        aria-label={shown ? "Hide keyboard" : "Show keyboard"}
        aria-expanded={shown}
        onPointerDown={onTabPointerDown}
        onClick={onTabClick}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span aria-hidden="true">{shown ? "▼" : "▲"}</span>
      </button>
      {shown && (
        <div
          className={styles.case}
          role="group"
          aria-label="Keyboard"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onClick={onClick}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div ref={keysRef} className={styles.keys}>
            <KeyRows modifiers={modifiers} pressed={pressed} />
            {popup && (
              <div
                className={styles.popup}
                aria-hidden="true"
                style={{
                  left: popup.left,
                  top: popup.top,
                  width: popup.width,
                  height: popup.height,
                  fontSize: popup.height * 0.55,
                }}
              >
                {popup.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Keyboard;
