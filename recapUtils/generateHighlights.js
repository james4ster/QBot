function generateHighlights(scoringRows) {
  const highlights = scoringRows.map(row => {
    let assistText = '';
    if (row.assist1 && row.assist2) assistText = `, assisted by ${row.assist1} & ${row.assist2}`;
    else if (row.assist1) assistText = `, assisted by ${row.assist1}`;
    return `${row.team} Goal! ${row.goalScorer}${assistText} (${row.period}P ${row.time})`;
  });

  // Optional: return top 3–5 highlights
  return highlights.slice(0, 3);
}
