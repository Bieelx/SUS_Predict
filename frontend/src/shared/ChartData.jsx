export default function ChartData({ title, rows, columns }) {
  if (!rows.length) return null;
  return <details className="chart-data">
    <summary>Ver dados: {title}</summary>
    <div className="legal-table" tabIndex={0} role="region" aria-label={title}>
      <table>
        <caption>{title}</caption>
        <thead><tr>{columns.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{columns.map(([key, , format]) => <td key={key}>{row[key] == null ? 'Indisponível' : format ? format(row[key]) : row[key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>;
}
