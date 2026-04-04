export function createInfoPanel(container) {
  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.top = '16px';
  panel.style.right = '16px';
  panel.style.width = '320px';
  panel.style.maxHeight = '80vh';
  panel.style.overflow = 'auto';
  panel.style.background = 'rgba(0,0,0,0.8)';
  panel.style.color = 'white';
  panel.style.padding = '12px';
  panel.style.borderRadius = '12px';
  panel.style.display = 'none';

  container.appendChild(panel);

  return {
    render(star) {
      if (!star) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
      }

      panel.style.display = 'block';
      panel.innerHTML = `
        <h2>${star.name}</h2>
        <p><strong>Faction:</strong> ${star.faction}</p>
        <p><strong>Spectral Type:</strong> ${star.spectralType}</p>
        <p><strong>Planets:</strong> ${star.planets.length}</p>
        <p><strong>Richness:</strong> ${star.richness}</p>
        <p><strong>Danger:</strong> ${star.danger}</p>
      `;
    }
  };
}