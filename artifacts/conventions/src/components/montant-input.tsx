import * as React from "react";
import { Input } from "@/components/ui/input";

type MontantInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "pattern"
> & {
  value?: string | number | null;
  onChange: (value: string) => void;
};

function normaliserMontant(value: string): string {
  const compact = value.replace(/[\s\u00a0\u202f]/g, "");
  const signe = compact.startsWith("-") ? "-" : "";
  const contenu = compact.replace(/-/g, "");
  const separateur = Math.max(contenu.lastIndexOf(","), contenu.lastIndexOf("."));

  if (separateur < 0) return signe + contenu.replace(/\D/g, "");

  const entier = contenu.slice(0, separateur).replace(/\D/g, "");
  const decimales = contenu.slice(separateur + 1).replace(/\D/g, "");
  return `${signe}${entier}.${decimales}`;
}

function formaterMontant(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";

  const normalise = normaliserMontant(String(value));
  const signe = normalise.startsWith("-") ? "-" : "";
  const contenu = normalise.replace(/^-/, "");
  const separateur = contenu.indexOf(".");
  const entier = separateur < 0 ? contenu : contenu.slice(0, separateur);
  const decimales = separateur < 0 ? undefined : contenu.slice(separateur + 1);
  const entierGroupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${signe}${entierGroupe}${decimales === undefined ? "" : `,${decimales}`}`;
}

function positionCurseur(value: string, caracteresAvant: number): number {
  if (caracteresAvant === 0) return 0;

  let caracteresComptes = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== " ") caracteresComptes += 1;
    if (caracteresComptes === caracteresAvant) {
      let position = index + 1;
      while (value[position] === " ") position += 1;
      return position;
    }
  }
  return value.length;
}

export const MontantInput = React.forwardRef<HTMLInputElement, MontantInputProps>(
  ({ value, onChange, onBlur, ...props }, forwardedRef) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const valeurFormatee = formaterMontant(value);
    const [affichage, setAffichage] = React.useState(valeurFormatee);

    React.useImperativeHandle(forwardedRef, () => inputRef.current!, []);
    React.useEffect(() => {
      setAffichage(valeurFormatee);
    }, [valeurFormatee]);

    const gererChangement = (event: React.ChangeEvent<HTMLInputElement>) => {
      const brut = event.currentTarget.value;
      const curseur = event.currentTarget.selectionStart ?? brut.length;
      const normalise = normaliserMontant(brut);
      const caracteresAvant = normaliserMontant(brut.slice(0, curseur)).length;
      const formate = formaterMontant(normalise);
      const nouvellePosition = positionCurseur(formate, caracteresAvant);

      setAffichage(formate);
      onChange(normalise);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input && document.activeElement === input) {
          input.setSelectionRange(nouvellePosition, nouvellePosition);
        }
      });
    };

    return (
      <Input
        {...props}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        pattern="[0-9 ]*(,[0-9]{0,2})?"
        title="Saisissez un montant positif ou nul avec deux décimales maximum."
        value={affichage}
        onChange={gererChangement}
        onBlur={onBlur}
      />
    );
  },
);

MontantInput.displayName = "MontantInput";
