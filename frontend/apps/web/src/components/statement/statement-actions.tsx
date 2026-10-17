import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { buildPdf } from "@agro/shared/modules/statements/domain/pdf";
import type { Statement } from "@agro/shared/modules/statements/domain/statement";
import { statementFileName, toPdfDoc } from "@agro/shared/modules/statements/domain/statement-view";
import { downloadPdf } from "@agro/shared/modules/statements/infrastructure/download-pdf";
import { Button } from "@agro/shared/ui/button";

// "Descargar PDF" builds a real PDF file in the browser; "Imprimir" opens the print dialog (print CSS hides everything else).
export function StatementActions({ statement }: { statement: Statement }) {
  const [failed, setFailed] = useState(false);

  function download() {
    try {
      setFailed(!downloadPdf(buildPdf(toPdfDoc(statement)), statementFileName(statement)));
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="statement-no-print flex flex-wrap items-center gap-2">
      <Button type="button" size="compact" onClick={download}>
        <Download aria-hidden="true" />
        Descargar PDF
      </Button>
      <Button type="button" variant="outline" size="compact" onClick={() => window.print()}>
        <Printer aria-hidden="true" />
        Imprimir
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          No pudimos generar el PDF. Intenta de nuevo o usa Imprimir.
        </p>
      )}
    </div>
  );
}
