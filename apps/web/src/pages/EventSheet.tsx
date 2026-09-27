import { useState, type FormEvent } from "react";
import type { DigEvent } from "../events";

type Values = Pick<DigEvent, "name" | "description" | "date" | "targets">;

export function EventSheet(props: {
  title: string;
  submitLabel: string;
  initial?: Values;
  onCancel: () => void;
  onSubmit: (values: Values) => void;
}) {
  const [values, setValues] = useState<Values>(props.initial ?? { name: "", description: "", date: "", targets: "" });
  const set = (key: keyof Values) => (event: { target: { value: string } }) => setValues({ ...values, [key]: event.target.value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (values.name.trim()) props.onSubmit({ ...values, name: values.name.trim() });
  };
  return (
    <div className="scrim" onClick={props.onCancel}>
      <form className="sheet" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <h3>{props.title}</h3>
        <label>Event name</label>
        <input autoFocus value={values.name} onChange={set("name")} placeholder="Code Cubicle 7.0" />
        <label>Description</label>
        <textarea rows={2} value={values.description} onChange={set("description")} placeholder="What is this event?" />
        <label>Event date</label>
        <input value={values.date} onChange={set("date")} placeholder="Nov 14–15" />
        <label>Targets</label>
        <input value={values.targets} onChange={set("targets")} placeholder="15+ sponsors, 8 judges, 20 student teams" />
        <div className="actions">
          <button type="button" className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn blue" disabled={!values.name.trim()}>
            {props.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
