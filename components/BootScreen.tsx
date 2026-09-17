import { View, Text, Image } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

const TITLE = 'HABIT TRACKER';

export default function BootScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background p-4">
      <Animated.View entering={FadeIn.duration(600)}>
        <Image
          source={require('@/assets/icon_transparent.png')}
          style={{ width: 128, height: 128 }}
          resizeMethod="resize"
        />
      </Animated.View>
      <View className="flex-row items-center">
        {TITLE.split('').map((ch, i) =>
          ch === ' ' ? (
            <Text key={i} className="text-5xl font-black">{'  '}</Text>
          ) : (
            <Animated.Text
              key={i}
              entering={ZoomIn.delay(400 + i * 55).springify().damping(12)}
              className="text-5xl font-black text-text">
              {ch}
            </Animated.Text>
          )
        )}
      </View>
    </View>
  );
}
