export function paintPortrait(context, face, width, height) {
  context.fillStyle = '#182839';
  context.fillRect(0, 0, width, height);
  const unit = Math.min(width / 640, height / 360);
  const centerX = width * (0.5 + ((face?.x ?? 96) / 192 - 0.5) * 0.54);
  const centerY = height * (0.49 + ((face?.y ?? 96) / 192 - 0.5) * 0.3);
  const size = unit * Math.min(1.13, Math.max(0.71, (face?.size ?? 63) / 63));

  context.save();
  context.translate(centerX, centerY);
  context.scale(size, size);
  const ellipse = (x, y, rx, ry, color) => {
    context.beginPath();
    context.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
    context.fillStyle = color;
    context.fill();
  };
  ellipse(0, 155, 154, 70, '#519795');
  ellipse(0, -3, 98, 104, '#e0a264');
  ellipse(-93, -5, 15, 29, '#68cec0');
  ellipse(93, -5, 15, 29, '#68cec0');
  ellipse(0, 3, 82, 78, '#1f394b');
  ellipse(-29, -8, 12, 18, '#99f4d5');
  ellipse(29, -8, 12, 18, '#99f4d5');
  context.strokeStyle = '#99f4d5';
  context.lineWidth = 5;
  context.beginPath();
  context.arc(0, 16, 24, 0.23 * Math.PI, 0.77 * Math.PI);
  context.stroke();
  context.restore();

  context.fillStyle = '#101b27';
  context.fillRect(0, height - 39 * unit, width, 39 * unit);
  context.fillStyle = '#fff4df';
  context.textBaseline = 'middle';
  context.font = 'bold ' + Math.round(19 * unit) + 'px sans-serif';
  context.fillText('SYNTHETIC VIDEO  /  DEMO AVATAR', 16 * unit, height - 19 * unit);
}
