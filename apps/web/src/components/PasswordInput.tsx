import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { Tip } from "./Tip";

/** A password field with an eye button to show or hide what was typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";
  return (
    <span className="password-field">
      <input {...props} type={visible ? "text" : "password"} />
      <Tip text={label}>
        <button type="button" className="password-toggle" aria-label={label} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </Tip>
    </span>
  );
}
