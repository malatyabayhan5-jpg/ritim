import expo.modules.kurguengine.anim.Keyframes;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

/**
 * Keyframes.java'yı JS tarafının ürettiği örneklerle karşılaştırır.
 * Satır biçimi: "packed değerler | t | beklenen".
 */
public class KeyframesTest {
  public static void main(String[] args) throws Exception {
    List<String> lines = Files.readAllLines(Paths.get(args.length > 0 ? args[0] : "tests/fixtures/keyframes.txt"), StandardCharsets.UTF_8);
    int n = 0;
    double worst = 0;
    for (String line : lines) {
      if (line.isBlank() || line.startsWith("#")) continue;
      String[] parts = line.split("\\|");
      String[] nums = parts[0].trim().split("\\s+");
      float[] packed = new float[nums.length];
      for (int i = 0; i < nums.length; i++) packed[i] = Float.parseFloat(nums[i]);
      double t = Double.parseDouble(parts[1].trim());
      double expected = Double.parseDouble(parts[2].trim());
      double got = Keyframes.valueAt(packed, t, -999f);
      double err = Math.abs(got - expected);
      worst = Math.max(worst, err);
      if (err > 1e-3 * Math.max(1, Math.abs(expected))) {
        System.out.println("HATA: t=" + t + " beklenen=" + expected + " bulunan=" + got + " iz=" + parts[0].trim());
        System.exit(1);
      }
      n++;
    }
    if (n < 50) {
      System.out.println("HATA: örnek sayısı az: " + n);
      System.exit(1);
    }
    System.out.println("Anahtar kare testleri geçti: " + n + " örnek, en büyük fark " + worst);
  }
}
