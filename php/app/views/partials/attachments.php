<?php /** @var array $attachments */ ?>
<div class="attachments">
<?php
$photos = array_values(array_filter($attachments, fn($a) => $a['kind'] === 'photo'));
$rest = array_values(array_filter($attachments, fn($a) => $a['kind'] !== 'photo'));
?>
<?php if ($photos): ?>
  <div class="att_photos">
    <?php foreach ($photos as $a): $p = $a['photo']; ?>
      <a class="att_photo" href="/photo<?= (int)$p['owner_id'] ?>_<?= (int)$p['id'] ?>">
        <img<?= count($photos) === 1 ? ' class="single"' : '' ?>
             src="/uploads/<?= e(count($photos) === 1 ? $p['file'] : $p['thumb']) ?>" alt=""></a>
    <?php endforeach; ?>
    <div class="clear"></div>
  </div>
<?php endif; ?>

<?php foreach ($rest as $a): ?>
  <?php if ($a['kind'] === 'video' && $a['video']): $v = $a['video']; ?>
    <div class="att_video">
      <video controls preload="metadata" src="/uploads/<?= e($v['file']) ?>"
        <?= $v['poster'] ? 'poster="/uploads/' . e($v['poster']) . '"' : '' ?>></video>
      <div class="att_cap gray small"><?= e($v['title']) ?> &middot; <?= e(human_size((int)$v['size'])) ?>
        <?= $v['duration'] ? ' &middot; ' . e(human_duration((int)$v['duration'])) : '' ?></div>
    </div>
  <?php elseif (($a['kind'] === 'audio' || $a['kind'] === 'voice') && $a['audio']): $s = $a['audio']; ?>
    <?php if ($a['kind'] === 'voice'): ?>
      <div class="att_voice">
        <span class="voice_ico">&#9834;</span><span class="gray">Голосовое сообщение</span>
        <div><audio controls preload="none" src="/uploads/<?= e($s['file']) ?>"></audio></div>
      </div>
    <?php else: ?>
      <div class="att_audio">
        <div class="att_audio_ttl"><b><?= e($s['artist']) ?></b> &ndash; <?= e($s['title']) ?>
          <?= $s['duration'] ? '<span class="gray small">' . e(human_duration((int)$s['duration'])) . '</span>' : '' ?></div>
        <audio controls preload="none" src="/uploads/<?= e($s['file']) ?>"></audio>
      </div>
    <?php endif; ?>
  <?php elseif ($a['kind'] === 'doc' && $a['doc']): $d = $a['doc']; ?>
    <div class="att_doc">
      <a href="/doc<?= (int)$d['owner_id'] ?>_<?= (int)$d['id'] ?>"><?= e($d['name']) ?></a>
      <span class="gray"><?= e(mb_strtoupper($d['ext'])) ?>, <?= e(human_size((int)$d['size'])) ?></span>
    </div>
  <?php endif; ?>
<?php endforeach; ?>
</div>
