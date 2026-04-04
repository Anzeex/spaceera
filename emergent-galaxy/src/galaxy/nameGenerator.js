const firstNamePrefixes = [
  'Ari','Bex','Cal','Dra','Eli','Fae','Gor','Hyr','Il','Jax','Kel','Lyx','Myr','Nex','Ori','Pyx','Qir','Rae','Syl','Tyr','Ula','Vex','Wyn','Xan','Yor','Zer','Ael','Bri','Cyr','Dex','Eon','Fyn','Geo','Hal','Ira','Jyn','Kae','Lio','Mav','Nai','Ory','Pax','Quo','Ria','Siv','Tor','Uru','Vor','Wex','Xer','Yen','Zal','Ari','Bri','Cea','Dio','Ela','Fio','Gae','Hio','Ira','Jae','Kio','Lya','Mia','Nya','Ola','Pia','Qia','Ria','Sia','Tia','Ula','Via','Wia','Xia','Yla','Zia'
];

const firstNameSuffixes = [
  'an','en','or','is','ex','ar','os','us','ea','ia','on','em','ir','al','yn','el','ix','ax','ra','yn','is','or','us','ya','iu','ae','es','um','ax','ir','al','os','is','us','ae','io','am','ut','as','ek','il','oz','ur','en','or','an','ea','ia','yl','yn'
];

const lastNames = [
  'Nova','Sol','Ryn','Vox','Astra','Vega','Orion','Lyra','Astraeus','Kepler','Zenith','Helix','Quasar','Polaris','Nebula','Vortex','Sirius','Pulsar','Phoenix','Celeste','Aurora','Lumen','Eclipse','Nimbus','Aether','Vesper','Radiant','Galax','Lunaris','Equinox','Stellar','Comet','Cosmos','Halo','Zenon','Arcadia','Mirage','Sable','Obsidian','Vela','Nebulon','Astrol','Celestia','Seren','Radian','Lyric','Nexion','Solace','Orbis','Cygnus','Astral','Aquila','Caelum','Corona','Delphi','Erebus','Fathom','Glimmer','Horizon','Ionis','Juno','Krypton','Lumina','Monarch','Nyx','Onyx','Praxis','Quillon','Rune','Solace','Talos','Umbra','Velora','Warden','Xylo','Yttrium','Zenon','Azura','Bront','Cinder','Drift','Ember','Frost','Gale','Haven','Icarus','Jade','Kestrel','Lyric','Mistral','Noctis','Oracle','Pyxis','Quasar','Rune','Sable','Talon','Umbra','Vale','Wyvern','Zephyr'
];

const firstNames = generateFirstNames(1000);

function generateFirstNames(count) {
  const names = [];

  for (const prefix of firstNamePrefixes) {
    for (const suffix of firstNameSuffixes) {
      if (names.length >= count) break;
      names.push(`${prefix}${suffix}`);
    }
    if (names.length >= count) break;
  }

  return names;
}

export function createStarName(index, rng) {
  const first = firstNames[index % firstNames.length];
  const last = rng.randomChoice(lastNames);
  return `${first} ${last}`;
}
