<p align="center">
  <img src="icon-192.png" width="96" alt="Flip 7 icon: a yellow card with a big 7">
</p>

<h1 align="center">Flip 7 Scorekeeper</h1>

<p align="center">
  Put the pencil down. Keep score for <b>Flip 7</b> on your phone.<br>
  <a href="https://rskorp.github.io/flip7/"><b>▶ Open the app</b></a>
</p>

---

Flip 7 is a push-your-luck card game: flip cards one by one, bank your points before you draw a duplicate number, and race to 200. The game is quick and fun. Adding up the points is not.

This little web app does the maths for you, so you can spend the evening flipping cards instead of adding them up.

## What it does

- **Players**: add, rename or remove as many players as you like.
- **Tap, don't type**: for each player, tap the number cards they kept (0–12). The app blocks duplicates and stops at seven numbers.
- **Modifiers**: tap ×2 and the +2 / +4 / +6 / +8 / +10 bonuses.
- **Flip 7 bonus**: seven different numbers automatically add **+15**.
- **Busted**: one tap and the player scores zero for the round.
- **Live leaderboard**: shows who's ahead and how close everyone is to 200.
- **History**: a round-by-round table, with a ✎ button to fix a round if someone miscounted.
- **Winner announcement**: shown at the end of the round in which someone reaches 200 points.
- **New game / Reset**: keep the same players or start from scratch.
- **Works offline-ish**: your game is saved on your phone, so closing the app won't lose the score.
- **Dark mode**: follows your phone's setting.

## How scoring works

```
round score = (sum of number cards) × 2 if you have the ×2
            + bonus cards (+2 … +10)
            + 15 if you flipped 7 different numbers
busted?     → 0
```

The game ends at the end of the round in which someone reaches **200**. Highest total wins.

## Install it on your phone

1. Open **https://rskorp.github.io/flip7/** on your phone.
2. **iPhone**: in Safari, tap Share, then **Add to Home Screen**.
   **Android**: in Chrome, tap ⋮, then **Add to Home screen**.
3. Launch it from the yellow **7** icon. It opens full screen, like a real app.

## Under the hood

The whole app is a single `index.html` file: plain HTML, CSS and JavaScript, with no framework and no build step. Scores are stored in your browser's `localStorage` and never leave your device.

```
index.html            the app
manifest.json         home-screen app settings
icon-*.png            app icons
apple-touch-icon.png  iOS home-screen icon
```

To run it locally, just open `index.html` in a browser.

---

<sub>Fan-made score tracker, not affiliated with the publishers of Flip 7. Go buy the game, it's great.</sub>
