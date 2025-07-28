package protocol

import (
	"fmt"
)

func S2EInitScene(scene string) []byte {
	return []byte("scene|" + scene)
}

func S2EMachineOnline(machineID int, online bool) []byte {
	return []byte(fmt.Sprintf("machineonline|%d|%t", machineID, online))
}

func S2EAddPromptImage(url string) []byte {
	packet := NewPacket()
	packet.U8(1)
	packet.String(url)
	return packet.ToBuffer()
}

func S2EDeletePromptImage(index uint8) []byte {
	packet := NewPacket()
	packet.U8(2)
	packet.U8(index)
	return packet.ToBuffer()
}
