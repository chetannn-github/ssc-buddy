package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusImagePolicyTest {
  @Test fun rotationAvoidsImmediateRepeatsButSupportsOneOfflineImage() {
    assertEquals(listOf("second", "third"), FocusImagePolicy.candidates(listOf("first", "second", "third", "first"), "first"))
    assertEquals(listOf("first"), FocusImagePolicy.candidates(listOf("first"), "first"))
    assertTrue(FocusImagePolicy.candidates(emptyList(), "first").isEmpty())
  }
  @Test fun avatarNamesSupportSpacesAndUnicodeWithoutAcceptingPathsOrUrls() {
    for (name in listOf("Study quote.jpg", "💪🏻.jpg", "forest.WEBP", "motivation.png")) assertTrue(FocusImagePolicy.validName(name))
    for (name in listOf("../image.jpg", "folder/image.jpg", "folder\\image.jpg", "https://site.test/image.jpg", "image.jpg?x=1", "manifest.json")) assertFalse(FocusImagePolicy.validName(name))
  }
}
